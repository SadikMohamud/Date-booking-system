// Booking emails through Resend, with the calendar file attached.
//
// The idempotency key makes a retried send a no-op at Resend, so nobody gets
// the same confirmation twice. Without a key set (a local run), emails are
// written to the server log instead of sent.

import type { Mailer } from './booking.ts';

export function resendMailer(apiKey: string, from: string, f: typeof fetch = fetch): Mailer {
  return {
    async send(m) {
      const res = await f('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': m.idempotencyKey },
        body: JSON.stringify({
          from,
          to: [m.to],
          subject: m.subject,
          text: m.text,
          attachments: m.ics ? [{ filename: 'booking.ics', content: Buffer.from(m.ics).toString('base64'), content_type: 'text/calendar' }] : undefined,
        }),
      });
      if (!res.ok) throw new Error(`The email could not be sent (${res.status}).`);
    },
  };
}

export const logMailer: Mailer = {
  async send(m) {
    console.info(`[email to ${m.to}] ${m.subject}\n${m.text}`);
  },
};
