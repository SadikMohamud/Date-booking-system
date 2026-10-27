// Cancel a booking by its signed link. See lib/booking/http.ts.
import { cancelHandler } from '@/lib/booking/http';
import { bookingDeps, bookingLimiter } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return cancelHandler(bookingDeps(), bookingLimiter(), req);
}
