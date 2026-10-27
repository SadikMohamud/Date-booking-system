// The demo app's shell. A site built on this repo has its own.
import type { ReactNode } from 'react';

export const metadata = { title: 'Bookings' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>{children}</body>
    </html>
  );
}
