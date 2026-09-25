import { Suspense } from 'react';
import { ProcessingApp } from '../../../components/processing-app';

export default function ProcessingPage() {
  return (
    <Suspense fallback={<main className="auth-page"><p className="muted">Loading Processing…</p></main>}>
      <ProcessingApp />
    </Suspense>
  );
}
