import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MillSaathi',
  description: 'Operations and ERP for Indian mills',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
