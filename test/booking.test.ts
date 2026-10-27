// The booking module on a real Postgres (PGlite), with a recording mailer
// and a fixed clock.
//
// Covers what Launch's verifier checks for: a booking with both
// confirmations; double booking refused by the database; cancellation that
// frees the slot and tells both sides; bad input refused; the rate limit.

import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { book, BookingError, cancel, cancelToken, freeSlots, readCancelToken, type BookingDeps, type Mailer } from '../lib/booking/booking.ts';
import { checkConfig, type BookingConfig } from '../lib/booking/config.ts';
import { bookHandler, cancelHandler, slotsHandler } from '../lib/booking/http.ts';
import { memoryLimiter } from '../lib/booking/protect.ts';
import { localToUtc, offsetMinutes } from '../lib/booking/time.ts';

const config: BookingConfig = {
  timeZone: 'Europe/London',
  services: [
    { slug: 'cut', title: 'Haircut', minutes: 30, price_pence: 2200 },
    { slug: 'long', title: 'Cut and colour', minutes: 90, price_pence: 8000 },
  ],
  hours: { 1: [{ open: '09:00', close: '12:00' }] },
  stepMinutes: 30,
  leadMinutes: 60,
  horizonDays: 30,
};

// Monday 2 November 2026 is after the clocks go back: London is on UTC.
const MONDAY = '2026-11-02';
const NOW = new Date('2026-10-30T12:00:00Z');

class RecordingMailer implements Mailer {
  sent: Parameters<Mailer['send']>[0][] = [];
  async send(m: Parameters<Mailer['send']>[0]) {
    this.sent.push(m);
  }
}

async function setup() {
  const pg = await PGlite.create();
  await pg.exec(await readFile(new URL('../lib/booking/schema.sql', import.meta.url), 'utf8'));
  const mailer = new RecordingMailer();
  const deps: BookingDeps = {
    db: { query: async (sql, params) => ({ rows: (await pg.query(sql, params)).rows as never[] }) },
    mailer,
    config: checkConfig(config),
    business: { name: 'Fade Theory', email: 'owner@fadetheory.example', siteUrl: 'https://fadetheory.example' },
    secret: 'x'.repeat(40),
    now: () => NOW,
  };
  return { pg, deps, mailer };
}

const input = (over: Record<string, unknown> = {}) => ({
  service: 'cut',
  start: '2026-11-02T09:30:00Z',
  name: 'Sam Visitor',
  email: 'Sam@Example.com',
  ...over,
});

test('London times convert across the clock change', () => {
  assert.equal(offsetMinutes(new Date('2026-07-01T12:00:00Z'), 'Europe/London'), 60);
  assert.equal(offsetMinutes(new Date('2026-12-01T12:00:00Z'), 'Europe/London'), 0);
  assert.equal(localToUtc('2026-07-06', '09:00', 'Europe/London').toISOString(), '2026-07-06T08:00:00.000Z');
  assert.equal(localToUtc(MONDAY, '09:00', 'Europe/London').toISOString(), '2026-11-02T09:00:00.000Z');
});

test('free slots follow the hours, the step, the length of the service and existing bookings', async () => {
  const { deps } = await setup();
  const times = async (s: string) => (await freeSlots(deps, s, MONDAY)).map((d) => d.toISOString().slice(11, 16));
  assert.deepEqual(await times('cut'), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
  assert.deepEqual(await times('long'), ['09:00', '09:30', '10:00', '10:30']);
  assert.deepEqual(await freeSlots(deps, 'cut', '2026-11-03'), [], 'closed on Tuesday');

  await book(deps, input());
  assert.deepEqual(await times('cut'), ['09:00', '10:00', '10:30', '11:00', '11:30']);
  // A 90 minute service cannot start where it would run into the booking.
  assert.deepEqual(await times('long'), ['10:00', '10:30']);
});

test('a booking emails both sides, with a calendar file and a cancel link', async () => {
  const { deps, mailer } = await setup();
  const b = await book(deps, input());
  assert.equal(b.email, 'sam@example.com');
  assert.deepEqual(mailer.sent.map((m) => m.to), ['sam@example.com', 'owner@fadetheory.example']);
  assert.match(mailer.sent[0]!.subject, /^Booked: Haircut, Monday 2 November, 09:30$/);
  assert.match(mailer.sent[0]!.text, /https:\/\/fadetheory\.example\/booking\/cancel\?token=/);
  assert.match(mailer.sent[0]!.ics!, /DTSTART:20261102T093000Z\r\nDTEND:20261102T100000Z/);
  assert.match(mailer.sent[1]!.text, /Sam Visitor \(sam@example\.com\) booked Haircut/);
});

test('double booking is refused, even when the app check is bypassed', async () => {
  const { deps, pg } = await setup();
  await book(deps, input());
  await assert.rejects(book(deps, input({ email: 'other@example.com' })), (e: BookingError) => e.status === 409);
  // Straight into the table, overlapping by fifteen minutes: the database refuses it.
  await assert.rejects(
    pg.query(`insert into bookings (service_slug, starts_at, ends_at, name, email) values ('cut', '2026-11-02T09:45:00Z', '2026-11-02T10:15:00Z', 'X', 'x@example.com')`),
    /bookings_no_overlap/,
  );
});

test('only offered start times can be booked', async () => {
  const { deps } = await setup();
  await assert.rejects(book(deps, input({ start: '2026-11-02T09:10:00Z' })), /not available/, 'off the step');
  await assert.rejects(book(deps, input({ start: '2026-11-02T13:00:00Z' })), /not available/, 'after closing');
  await assert.rejects(book(deps, input({ start: '2026-10-30T12:30:00Z' })), /not available/, 'inside the lead time');
});

test('cancelling frees the slot and tells both sides; twice is harmless; a forged link is refused', async () => {
  const { deps, mailer } = await setup();
  const b = await book(deps, input());
  const token = cancelToken(deps.secret, b.id);
  assert.equal(readCancelToken(deps.secret, token), b.id);
  assert.equal(readCancelToken('y'.repeat(40), token), null);

  assert.equal((await cancel(deps, token)).status, 'cancelled');
  assert.deepEqual(mailer.sent.slice(2).map((m) => m.subject), ['Cancelled: Haircut, Monday 2 November, 09:30', 'Cancelled: Haircut, Monday 2 November, 09:30']);
  assert.match(mailer.sent[2]!.ics!, /METHOD:CANCEL/);
  assert.ok((await freeSlots(deps, 'cut', MONDAY)).some((d) => d.toISOString() === '2026-11-02T09:30:00.000Z'));

  await cancel(deps, token);
  assert.equal(mailer.sent.length, 4, 'no second round of emails');
  await assert.rejects(cancel(deps, `${b.id}.forged`), /not valid/);
});

test('bad input is refused with a reason, and the hidden field stops bots', async () => {
  const { deps } = await setup();
  await assert.rejects(book(deps, input({ email: 'not an email' })), BookingError);
  await assert.rejects(book(deps, input({ name: 'S' })), BookingError);
  await assert.rejects(book(deps, input({ service: 'massage' })), /not offered/);
  await assert.rejects(book(deps, input({ website: 'http://spam.example' })), BookingError);
  await assert.rejects(freeSlots(deps, 'cut', '2 Nov'), /YYYY-MM-DD/);
});

test('the routes: JSON only, a size cap, and ten bookings a minute per address', async () => {
  const { deps } = await setup();
  const limiter = memoryLimiter(10, 60);
  const post = (body: unknown, type = 'application/json') =>
    new Request('https://fadetheory.example/api/bookings', { method: 'POST', headers: { 'content-type': type, 'x-real-ip': '203.0.113.9' }, body: JSON.stringify(body) });

  assert.equal((await bookHandler(deps, limiter, post(input(), 'text/plain'))).status, 415);
  assert.equal((await bookHandler(deps, limiter, post({ ...input(), note: 'x'.repeat(5000) }))).status, 413);
  const ok = await bookHandler(deps, limiter, post(input()));
  assert.equal(ok.status, 201);

  const slots = await slotsHandler(deps, new Request(`https://fadetheory.example/api/slots?service=cut&date=${MONDAY}`));
  assert.equal(((await slots.json()) as { slots: string[] }).slots.length, 5);

  for (let i = 0; i < 7; i += 1) await bookHandler(deps, limiter, post(input({ email: 'no' })));
  assert.equal((await bookHandler(deps, limiter, post(input()))).status, 429);
  assert.equal((await cancelHandler(deps, memoryLimiter(10, 60), post({ token: 'nope' }))).status, 404);
});

test('a mistyped config fails when it is loaded', () => {
  assert.throws(() => checkConfig({ ...config, hours: { 1: [{ open: '17:00', close: '09:00' }] } }), /not a valid window/);
  assert.throws(() => checkConfig({ ...config, timeZone: 'Mars/Olympus' }), /unknown time zone/);
});
