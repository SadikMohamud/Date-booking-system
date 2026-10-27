// Make a booking. See lib/booking/http.ts.
import { bookHandler } from '@/lib/booking/http';
import { bookingDeps, bookingLimiter } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return bookHandler(bookingDeps(), bookingLimiter(), req);
}
