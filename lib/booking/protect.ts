// Rate limiting for the booking routes, by visitor address.
//
// With Upstash Redis set in the environment the count is shared across every
// server instance; without it, each instance counts on its own, which still
// stops a single burst. A fixed window: simple, and enough to stop a script
// filling the diary.

export interface Limiter {
  /** True if this address may make another request now. */
  allow(key: string): Promise<boolean>;
}

export function memoryLimiter(limit: number, windowSeconds: number, now: () => number = Date.now): Limiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    async allow(key) {
      const t = now();
      const h = hits.get(key);
      if (!h || h.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowSeconds * 1000 });
        return true;
      }
      h.count += 1;
      return h.count <= limit;
    },
  };
}

export function upstashLimiter(url: string, token: string, limit: number, windowSeconds: number, f: typeof fetch = fetch): Limiter {
  return {
    async allow(key) {
      const k = `booking:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
      const res = await f(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          ['INCR', k],
          ['EXPIRE', k, String(windowSeconds)],
        ]),
      });
      // If the store is down, let the request through: bookings matter more.
      if (!res.ok) return true;
      const [incr] = (await res.json()) as [{ result: number }];
      return incr.result <= limit;
    },
  };
}

/** The visitor's address as the host reports it. */
export function clientAddress(headers: Headers): string {
  return headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
