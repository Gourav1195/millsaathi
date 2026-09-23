import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Sans, Noto_Sans_Devanagari } from 'next/font/google';
import { RegionScript } from '../components/region-script';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['500', '600', '700'],
  variable: '--font-noto-deva',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MillSaathi',
  description: 'Operations and ERP for Indian mills',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${archivo.variable} ${notoDevanagari.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <RegionScript />
        {children}
      </body>
    </html>
  );
}
