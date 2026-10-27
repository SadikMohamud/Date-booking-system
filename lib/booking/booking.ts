// The booking module: free slots, booking, cancelling.
//
// Every outside thing is passed in (the database, the mailer, the clock, the
// signing secret), so the same code runs in the routes and in the tests.
//
// A booking is checked against the opening hours here, and against every
// other booking by the database (bookings_no_overlap), so a race between two
// visitors ends with one booking and one clear "that time has just gone".
// Both sides get an email with a calendar file; each email carries a signed
// link to cancel. A cancelled booking frees its time at once.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BookingConfig, Service } from './config.ts';
import { dayOfWeek, describe, localToUtc } from './time.ts';

/** The smallest database surface the module needs. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Mailer {
  send(m: { to: string; subject: string; text: string; ics?: string; idempotencyKey: string }): Promise<void>;
}

export interface BookingDeps {
  db: Db;
  mailer: Mailer;
  config: BookingConfig;
  business: { name: string; email: string; siteUrl: string };
  /** Signs cancel links. At least 32 characters, from the environment. */
  secret: string;
  now?: () => Date;
}

export interface Booking {
  id: string;
  service_slug: string;
  starts_at: Date;
  ends_at: Date;
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  status: 'confirmed' | 'cancelled';
}

/** A refusal a visitor should see, with the HTTP status to send. */
export class BookingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BookingError';
    this.status = status;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BookingInput = z.object({
  service: z.string().min(1).max(60),
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s()-]{6,}$/, 'Enter a phone number with digits only.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  note: z.string().trim().max(500).optional(),
  /** A hidden field people never fill; bots do. */
  website: z.string().max(0).optional(),
});
export type BookingInput = z.infer<typeof BookingInput>;

function service(config: BookingConfig, slug: string): Service {
  const s = config.services.find((x) => x.slug === slug);
  if (!s) throw new BookingError('That service is not offered.');
  return s;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/** Start times still free on a local date for a service, in UTC. */
export async function freeSlots(deps: BookingDeps, slug: string, date: string): Promise<Date[]> {
  if (!DATE.test(date)) throw new BookingError('Give the date as YYYY-MM-DD.');
  const { config } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const s = service(config, slug);
  const windows = config.hours[dayOfWeek(date) as 0] ?? [];
  if (windows.length === 0) return [];

  const earliest = now.getTime() + config.leadMinutes * 60_000;
  const latest = now.getTime() + config.horizonDays * 86_400_000;
  const dayStart = localToUtc(date, '00:00', config.timeZone);
  const { rows } = await deps.db.query<{ starts_at: Date; ends_at: Date }>(
    `select starts_at, ends_at from bookings
      where status = 'confirmed' and starts_at < $2 and ends_at > $1`,
    [dayStart, new Date(dayStart.getTime() + 36 * 3_600_000)],
  );
  const taken = rows.map((r) => [new Date(r.starts_at).getTime(), new Date(r.ends_at).getTime()] as const);

  const out: Date[] = [];
  for (const w of windows) {
    const open = localToUtc(date, w.open, config.timeZone).getTime();
    const close = localToUtc(date, w.close, config.timeZone).getTime();
    for (let t = open; t + s.minutes * 60_000 <= close; t += config.stepMinutes * 60_000) {
      const end = t + s.minutes * 60_000;
      if (t < earliest || t > latest) continue;
      if (taken.some(([a, b]) => t < b && end > a)) continue;
      out.push(new Date(t));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cancel links
// ---------------------------------------------------------------------------

function sign(secret: string, id: string): string {
  return createHmac('sha256', secret).update(`cancel:${id}`).digest('base64url');
}

export function cancelToken(secret: string, id: string): string {
  return `${id}.${sign(secret, id)}`;
}

/** The booking id a cancel token names, or null if it was not signed by us. */
export function readCancelToken(secret: string, token: string): string | null {
  const [id, mac] = token.split('.');
  if (!id || !mac || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const want = Buffer.from(sign(secret, id));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

// ---------------------------------------------------------------------------
// Calendar file
// ---------------------------------------------------------------------------

const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function ics(b: Booking, title: string, business: BookingDeps['business'], method: 'REQUEST' | 'CANCEL'): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${icsText(business.name)}//Bookings//EN`,
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${b.id}@${new URL(business.siteUrl).hostname}`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(b.starts_at)}`,
    `DTEND:${icsTime(b.ends_at)}`,
    `SUMMARY:${icsText(`${title}, ${business.name}`)}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// ---------------------------------------------------------------------------
// Booking and cancelling
// ---------------------------------------------------------------------------

function toBooking(r: Record<string, unknown>): Booking {
  return { ...(r as unknown as Booking), starts_at: new Date(r.starts_at as string), ends_at: new Date(r.ends_at as string) };
}

export async function book(deps: BookingDeps, raw: unknown): Promise<Booking> {
  const parsed = BookingInput.safeParse(raw);
  if (!parsed.success) throw new BookingError(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
  const input = parsed.data;
  if (input.website) throw new BookingError('Check the form and try again.');

  const s = service(deps.config, input.service);
  const start = new Date(input.start);
  // Only a start time the slots offer can be booked: inside opening hours,
  // on the step, after the lead time and before the horizon.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: deps.config.timeZone }).format(start);
  const free = await freeSlots(deps, s.slug, date);
  if (!free.some((f) => f.getTime() === start.getTime())) throw new BookingError('That time is not available. Please choose another.', 409);

  let row: Record<string, unknown>;
  try {
    const { rows } = await deps.db.query(
      `insert into bookings (service_slug, starts_at, ends_at, name, email, phone, note)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [s.slug, start, new Date(start.getTime() + s.minutes * 60_000), input.name, input.email, input.phone ?? null, input.note ?? null],
    );
    row = rows[0]!;
  } catch (e) {
    if (/bookings_no_overlap|exclusion/i.test(String((e as Error).message))) {
      throw new BookingError('That time has just been taken. Please choose another.', 409);
    }
    throw e;
  }
  const b = toBooking(row);

  const when = describe(b.starts_at, deps.config.timeZone);
  const cancel = `${deps.business.siteUrl.replace(/\/$/, '')}/booking/cancel?token=${encodeURIComponent(cancelToken(deps.secret, b.id))}`;
  const calendar = ics(b, s.title, deps.business, 'REQUEST');
  await deps.mailer.send({
    to: b.email,
    subject: `Booked: ${s.title}, ${when}`,
    text: `Hello ${b.name},\n\nYou are booked in for ${s.title} on ${when} with ${deps.business.name}.\n\nIf you need to cancel, use this link:\n${cancel}\n\n${deps.business.name}\n`,
    ics: calendar,
    idempotencyKey: `booked-client-${b.id}`,
  });
  await deps.mailer.send({
    to: deps.business.email,
    subject: `New booking: ${s.title}, ${when}`,
    text: `${b.name} (${b.email}${b.phone ? `, ${b.phone}` : ''}) booked ${s.title} on ${when}.${b.note ? `\n\nTheir note: ${b.note}` : ''}\n\nTo cancel it:\n${cancel}\n`,
    ics: calendar,
    idempotencyKey: `booked-owner-${b.id}`,
  });
  return b;
}

/** Cancel by a signed token. Cancelling twice is not an error. */
export async function cancel(deps: BookingDeps, token: string): Promise<Booking> {
  const id = readCancelToken(deps.secret, token);
  if (!id) throw new BookingError('That cancel link is not valid.', 404);
  const { rows } = await deps.db.query(
    `update bookings set status = 'cancelled', cancelled_at = now()
      where id = $1 and status = 'confirmed' returning *`,
    [id],
  );
  if (!rows[0]) {
    const found = await deps.db.query(`select * from bookings where id = $1`, [id]);
    if (!found.rows[0]) throw new BookingError('That booking was not found.', 404);
    return toBooking(found.rows[0]);
  }
  const b = toBooking(rows[0]);
  const s = deps.config.services.find((x) => x.slug === b.service_slug);
  const title = s?.title ?? b.service_slug;
  const when = describe(b.starts_at, deps.config.timeZone);
  const calendar = ics(b, title, deps.business, 'CANCEL');
  await deps.mailer.send({
    to: b.email,
    subject: `Cancelled: ${title}, ${when}`,
    text: `Hello ${b.name},\n\nYour booking for ${title} on ${when} is cancelled.\n\n${deps.business.name}\n`,
    ics: calendar,
    idempotencyKey: `cancelled-client-${b.id}`,
  });
  await deps.mailer.send({
    to: deps.business.email,
    subject: `Cancelled: ${title}, ${when}`,
    text: `${b.name} (${b.email}) cancelled ${title} on ${when}. The time is free again.\n`,
    ics: calendar,
    idempotencyKey: `cancelled-owner-${b.id}`,
  });
  return b;
}
