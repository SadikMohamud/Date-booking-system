// What a business offers and when, as the booking module reads it.
//
// The site fills this in content/booking.ts. Everything here is checked when
// it is loaded, so a mistyped hour fails the build rather than a visitor.

export interface Service {
  slug: string;
  title: string;
  minutes: number;
  /** Shown beside the service; null when the price is on request. */
  price_pence: number | null;
}

export interface BookingConfig {
  timeZone: string;
  services: Service[];
  /** Opening hours by day, 0 Sunday to 6 Saturday; a day not listed is closed. */
  hours: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { open: string; close: string }[]>>;
  /** Start times are offered every this many minutes. */
  stepMinutes: number;
  /** No booking closer than this to now. */
  leadMinutes: number;
  /** No booking further ahead than this. */
  horizonDays: number;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function checkConfig(c: BookingConfig): BookingConfig {
  const fail = (m: string): never => {
    throw new Error(`content/booking.ts: ${m}`);
  };
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: c.timeZone });
  } catch {
    fail(`unknown time zone ${c.timeZone}`);
  }
  if (c.services.length === 0) fail('at least one service is needed');
  const slugs = new Set<string>();
  for (const s of c.services) {
    if (!/^[a-z0-9-]+$/.test(s.slug)) fail(`service slug "${s.slug}" must be lower case letters, digits and hyphens`);
    if (slugs.has(s.slug)) fail(`service slug "${s.slug}" is used twice`);
    slugs.add(s.slug);
    if (!Number.isInteger(s.minutes) || s.minutes < 5 || s.minutes > 600) fail(`${s.slug}: minutes must be 5 to 600`);
  }
  for (const [day, windows] of Object.entries(c.hours)) {
    for (const w of windows ?? []) {
      if (!HHMM.test(w.open) || !HHMM.test(w.close) || w.close <= w.open) fail(`day ${day}: ${w.open} to ${w.close} is not a valid window`);
    }
  }
  if (c.stepMinutes < 5) fail('stepMinutes must be at least 5');
  return c;
}
