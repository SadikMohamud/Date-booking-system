// What this business offers and when, for the booking module.
// A site built on this repo replaces these values with its own.

import type { BookingConfig } from '@/lib/booking/config';

export const bookingBusiness = {
  name: 'Example Studio',
  email: 'bookings@example.com',
  siteUrl: 'http://localhost:3000',
};

export const bookingConfig: BookingConfig = {
  timeZone: 'Europe/London',
  services: [
    { slug: 'consultation', title: 'Consultation', minutes: 30, price_pence: null },
    { slug: 'session', title: 'Full session', minutes: 60, price_pence: 6000 },
  ],
  hours: {
    1: [{ open: '09:00', close: '17:00' }],
    2: [{ open: '09:00', close: '17:00' }],
    3: [{ open: '09:00', close: '17:00' }],
    4: [{ open: '09:00', close: '19:00' }],
    5: [{ open: '09:00', close: '17:00' }],
    6: [{ open: '10:00', close: '14:00' }],
  },
  stepMinutes: 15,
  leadMinutes: 120,
  horizonDays: 60,
};
