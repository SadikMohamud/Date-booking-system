// The three booking routes as plain request handlers, so they can be tested
// without a server. The Next.js route files only call these.

import { book, BookingError, cancel, freeSlots, type BookingDeps } from './booking.ts';
import { clientAddress, type Limiter } from './protect.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function failure(e: unknown): Response {
  if (e instanceof BookingError) return json({ error: e.message }, e.status);
  console.error('booking route failed', e);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

/** GET /api/slots?service=cut&date=2026-11-02 */
export async function slotsHandler(deps: BookingDeps, req: Request): Promise<Response> {
  try {
    const u = new URL(req.url);
    const slots = await freeSlots(deps, u.searchParams.get('service') ?? '', u.searchParams.get('date') ?? '');
    return json({ slots: slots.map((s) => s.toISOString()) });
  } catch (e) {
    return failure(e);
  }
}

async function body(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) throw new BookingError('Send the form as JSON.', 415);
  const text = await req.text();
  if (text.length > 4000) throw new BookingError('That request is too large.', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new BookingError('Check the form and try again.');
  }
}

/** POST /api/bookings */
export async function bookHandler(deps: BookingDeps, limiter: Limiter, req: Request): Promise<Response> {
  try {
    if (!(await limiter.allow(clientAddress(req.headers)))) return json({ error: 'Too many attempts. Please wait a minute.' }, 429);
    const b = await book(deps, await body(req));
    return json({ id: b.id, starts_at: b.starts_at.toISOString() }, 201);
  } catch (e) {
    return failure(e);
  }
}

/** POST /api/bookings/cancel  { token } */
export async function cancelHandler(deps: BookingDeps, limiter: Limiter, req: Request): Promise<Response> {
  try {
    if (!(await limiter.allow(clientAddress(req.headers)))) return json({ error: 'Too many attempts. Please wait a minute.' }, 429);
    const { token } = (await body(req)) as { token?: unknown };
    if (typeof token !== 'string') throw new BookingError('That cancel link is not valid.', 404);
    const b = await cancel(deps, token);
    return json({ status: b.status });
  } catch (e) {
    return failure(e);
  }
}
