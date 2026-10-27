# Date Booking System

A lean booking module for a single business's Next.js site: visitors choose a
service, a day and a free time; both sides get an email with a calendar file;
either side can cancel from a signed link in that email.

## What it does

- **Free slots** from the opening hours, the length of each service, a step
  between start times, a minimum notice and a booking horizon, in the
  business's own time zone (correct across the clock change).
- **No double booking.** The database refuses any two confirmed bookings that
  overlap, so two visitors choosing the same time at once get one booking and
  one clear message.
- **Emails to both sides** through Resend, each with an `.ics` file. Sends
  carry an idempotency key, so a retry never sends twice.
- **Cancellation** by a signed link. The link opens a page with a button, so a
  mail scanner following links cannot cancel anything. Cancelling frees the
  time and emails both sides.
- **Protection.** Every input is validated; the booking routes accept JSON
  only, cap the request size, and allow ten requests a minute per address
  (shared across instances with Upstash Redis, per instance without). A hidden
  field turns bots away. Security headers on every response.

## Layout

| Path | What it is |
| --- | --- |
| `content/booking.ts` | The business, its services and hours. Edit this. |
| `lib/booking/booking.ts` | Slots, booking, cancelling, calendar files |
| `lib/booking/http.ts` | The three routes as plain handlers |
| `lib/booking/server.ts` | Wiring from the environment |
| `lib/booking/schema.sql` | The bookings table, made on first use |
| `components/BookingWidget.tsx` | The form. Takes its colours from the page's CSS variables |
| `app/booking/cancel` | The page a cancel link opens |

## Running it

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
npm test                     # on PGlite, no database needed
```

Environment: `DATABASE_URL`, `BOOKING_SECRET` (32 characters or more),
`RESEND_API_KEY` and `EMAIL_FROM` (without them emails are logged instead),
`SITE_URL`, and optionally `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`.

## Licence

MIT
