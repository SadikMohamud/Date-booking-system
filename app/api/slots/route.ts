// Free start times for a service on a date. See lib/booking/http.ts.
import { slotsHandler } from '@/lib/booking/http';
import { bookingDeps } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return slotsHandler(bookingDeps(), req);
}
