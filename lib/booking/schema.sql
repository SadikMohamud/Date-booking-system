-- Bookings for one business.
--
-- Services and opening hours live in content/booking.ts with the rest of the
-- site's copy; only the bookings themselves are stored. Two confirmed
-- bookings can never overlap: the database refuses it, so two visitors
-- choosing the same time at the same moment cannot both get it.

create table if not exists bookings (
  id                uuid primary key default gen_random_uuid(),
  service_slug      text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  name              text not null,
  email             text not null,
  phone             text,
  note              text,
  status            text not null default 'confirmed'
                      check (status in ('confirmed', 'cancelled')),
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  check (ends_at > starts_at),
  constraint bookings_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status = 'confirmed')
);

create index if not exists bookings_starts_idx on bookings (starts_at);
