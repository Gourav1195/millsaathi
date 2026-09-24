import { Suspense } from 'react';
import { GodownDetailApp } from '../../../../components/godown-detail-app';

export default function GodownDetailPage() {
  return (
    <Suspense fallback={<main className="auth-page"><p className="muted">Loading godown…</p></main>}>
      <GodownDetailApp />
    </Suspense>
  );
}
