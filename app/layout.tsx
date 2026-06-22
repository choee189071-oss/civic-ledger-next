import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Civic Ledger — Public Finance Workbench',
  description: 'California public finance AI research workspace — search, read, and cite official sources'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
