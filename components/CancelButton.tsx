'use client';

// The button on the cancel page: one click, then the outcome.

import { useState } from 'react';

export function CancelButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle');

  async function go() {
    setState('sending');
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string };
    setState(res?.ok ? 'done' : (data.error ?? 'Something went wrong. Please try again.'));
  }

  if (state === 'done') return <p role="status">Your booking is cancelled. A confirmation is on its way.</p>;
  return (
    <>
      <button type="button" onClick={go} disabled={state === 'sending'} style={{ font: 'inherit', fontWeight: 600, minHeight: 48, padding: '0.8rem 1.4rem', borderRadius: 999, border: 0, background: 'var(--accent, #2457ff)', color: 'var(--bg, #fff)', cursor: 'pointer' }}>
        {state === 'sending' ? 'Cancelling…' : 'Cancel the booking'}
      </button>
      {state !== 'idle' && state !== 'sending' && <p role="alert">{state}</p>}
    </>
  );
}
