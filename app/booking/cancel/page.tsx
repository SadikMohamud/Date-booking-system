// The page a cancel link in a booking email opens. Cancelling needs a click,
// so a mail scanner that follows links cannot cancel a booking by itself.

import { CancelButton } from '@/components/CancelButton';

export const metadata = { title: 'Cancel a booking', robots: { index: false } };

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main style={{ padding: '4rem 1rem', maxWidth: '36rem', margin: '0 auto' }}>
      <h1>Cancel your booking</h1>
      {token ? (
        <>
          <p>If you cancel, the time is freed for someone else and you will get an email to confirm.</p>
          <CancelButton token={token} />
        </>
      ) : (
        <p>This link is incomplete. Please use the link in your booking email.</p>
      )}
    </main>
  );
}
