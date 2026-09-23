import type { Metadata } from 'next';
import { LandingPage } from '../components/landing-page';

export const metadata: Metadata = {
  title: 'MillSaathi — Free Rice Mill Software & ERP for India',
  description:
    'Free mill management software for India\'s rice mills. Gate, weighbridge, lab, saudas, stock and the owner\'s nightly WhatsApp digest — every module, no cost, no card.',
};

export default function HomePage() {
  return <LandingPage />;
}
