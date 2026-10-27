// A demo page with the booking form, using content/booking.ts.
import { BookingWidget } from '@/components/BookingWidget';
import { bookingConfig } from '@/content/booking';

export default function Home() {
  return (
    <main style={{ padding: '4rem 1rem', maxWidth: '40rem', margin: '0 auto' }}>
      <h1>Book a time</h1>
      <BookingWidget services={bookingConfig.services} timeZone={bookingConfig.timeZone} />
    </main>
  );
}
