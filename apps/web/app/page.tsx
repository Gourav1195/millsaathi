import Link from 'next/link';

export default function HomePage() {
  return <main className="landing"><p className="eyebrow">MillSaathi</p><h1>Every quintal, accounted for.</h1><p>The operational workspace is now being migrated to React.</p><Link className="primary" href="/app">Open the app</Link></main>;
}
