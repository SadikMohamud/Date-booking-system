// The booking module's dependencies on the server, from the environment.
//
// DATABASE_URL   Postgres for the bookings table (made on first use)
// BOOKING_SECRET signs cancel links; at least 32 characters
// RESEND_API_KEY and EMAIL_FROM send the emails (logged instead if unset)
// SITE_URL       the public address, for links in emails
// UPSTASH_REDIS_REST_URL and _TOKEN share the rate limit (optional)
//
// Secrets are read here and nowhere else, and never sent to the browser.

import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { bookingBusiness, bookingConfig } from '@/content/booking';
import type { BookingDeps, Db } from './booking.ts';
import { checkConfig } from './config.ts';
import { logMailer, resendMailer } from './mail.ts';
import { memoryLimiter, upstashLimiter, type Limiter } from './protect.ts';

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

function db(): Db {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const p = pool;
  ready ??= p
    .query(readFileSync(path.join(process.cwd(), 'lib', 'booking', 'schema.sql'), 'utf8'))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return {
    async query(sql, params) {
      await ready;
      const r = await p.query(sql, params as unknown[]);
      return { rows: r.rows };
    },
  };
}

export function bookingDeps(): BookingDeps {
  const secret = process.env.BOOKING_SECRET ?? '';
  if (secret.length < 32) throw new Error('BOOKING_SECRET must be set to at least 32 characters.');
  const key = process.env.RESEND_API_KEY;
  return {
    db: db(),
    mailer: key && process.env.EMAIL_FROM ? resendMailer(key, process.env.EMAIL_FROM) : logMailer,
    config: checkConfig(bookingConfig),
    business: { ...bookingBusiness, siteUrl: process.env.SITE_URL ?? bookingBusiness.siteUrl },
    secret,
  };
}

let limiter: Limiter | null = null;

/** Ten booking requests a minute per address; slot lookups are not limited. */
export function bookingLimiter(): Limiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  limiter ??= url && token ? upstashLimiter(url, token, 10, 60) : memoryLimiter(10, 60);
  return limiter;
}
