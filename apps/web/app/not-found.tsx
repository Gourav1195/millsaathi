import type { Metadata } from 'next';
import { NotFoundPage } from '../components/not-found-page';

export const metadata: Metadata = {
  title: 'Page not found — MillSaathi',
  description: 'The page you requested is not in the MillSaathi register.',
};

export default function NotFound() {
  return <NotFoundPage context="site" />;
}
