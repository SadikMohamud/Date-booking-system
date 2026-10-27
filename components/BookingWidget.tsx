'use client';

// The booking form: choose a service, a day and a free time, then give a
// name and email. Times are shown in the business's own time zone. Colours
// and type come from the page's CSS variables, so it takes on the site's
// brand; it has no styling of its own beyond layout.

import { useEffect, useId, useState } from 'react';
import styles from './BookingWidget.module.css';

export interface WidgetService {
  slug: string;
  title: string;
  minutes: number;
  price_pence: number | null;
}

const pounds = (p: number) => `£${(p / 100).toFixed(p % 100 === 0 ? 0 : 2)}`;

function today(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function BookingWidget({ services, timeZone }: { services: WidgetService[]; timeZone: string }) {
  const id = useId();
  const [service, setService] = useState(services[0]?.slug ?? '');
  const [date, setDate] = useState(() => today(timeZone));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  useEffect(() => {
    let live = true;
    setSlots(null);
    setStart(null);
    fetch(`/api/slots?service=${encodeURIComponent(service)}&date=${date}`)
      .then((r) => r.json())
      .then((d: { slots?: string[] }) => live && setSlots(d.slots ?? []))
      .catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
  }, [service, date]);

  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!start) return;
    const f = new FormData(e.currentTarget);
    setStatus({ kind: 'sending' });
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service,
        start,
        name: f.get('name'),
        email: f.get('email'),
        phone: f.get('phone'),
        note: f.get('note'),
        website: f.get('website'),
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string };
    if (res?.ok) setStatus({ kind: 'done' });
    else setStatus({ kind: 'error', message: data.error ?? 'Something went wrong. Please try again.' });
  }

  if (status.kind === 'done') {
    return (
      <div className={styles.done} role="status">
        <p className={styles.title}>You are booked in.</p>
        <p>A confirmation is on its way to your inbox, with a link to cancel if you need to.</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate={false}>
      <div className={styles.row}>
        <label htmlFor={`${id}-service`}>Service</label>
        <select id={`${id}-service`} value={service} onChange={(e) => setService(e.target.value)}>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title}, {s.minutes} minutes{s.price_pence !== null ? `, ${pounds(s.price_pence)}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <label htmlFor={`${id}-date`}>Day</label>
        <input id={`${id}-date`} type="date" min={today(timeZone)} value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      <fieldset className={styles.slots}>
        <legend>Time</legend>
        {slots === null && <p className={styles.hint}>Finding free times…</p>}
        {slots?.length === 0 && <p className={styles.hint}>No free times that day. Please try another.</p>}
        {slots?.map((s) => (
          <button key={s} type="button" className={styles.slot} aria-pressed={start === s} onClick={() => setStart(s)}>
            {time(s)}
          </button>
        ))}
      </fieldset>

      <div className={styles.row}>
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={100} />
      </div>
      <div className={styles.row}>
        <label htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={200} />
      </div>
      <div className={styles.row}>
        <label htmlFor={`${id}-phone`}>Phone (optional)</label>
        <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={30} />
      </div>
      <div className={styles.row}>
        <label htmlFor={`${id}-note`}>Anything we should know (optional)</label>
        <textarea id={`${id}-note`} name="note" rows={3} maxLength={500} />
      </div>
      {/* Left empty by people; filled by bots, which are then refused. */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {status.kind === 'error' && (
        <p className={styles.error} role="alert">
          {status.message}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={!start || status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Booking…' : start ? `Book ${time(start)}` : 'Choose a time'}
      </button>
    </form>
  );
}
