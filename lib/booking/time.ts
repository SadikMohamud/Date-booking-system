// Wall clock times in the business's time zone, to and from UTC.
//
// Opening hours are written as local times ("09:00" in Europe/London) and
// must stay right across the clock change. Intl gives the zone's offset for
// any instant; a local time is converted by guessing with today's offset
// and correcting once, which is exact except inside the skipped hour in
// spring, where no booking can start anyway.

/** The zone's offset from UTC at an instant, in minutes (London summer: 60). */
export function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant a local date ("2026-11-02") and time ("09:30") name in a zone. */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const first = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  return new Date(naive - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/** Day of the week (0 Sunday to 6 Saturday) of a local date. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A local date and time for people: "Monday 2 November, 09:30". */
export function describe(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(at)
    .replace(' at ', ', ');
}
