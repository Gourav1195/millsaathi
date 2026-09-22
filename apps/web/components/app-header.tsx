import Link from 'next/link';
import type { Session } from '../lib/session';

export function AppHeader({ session }: { session: Session }) {
  return <header className="topbar"><h1>{session.mill.name}</h1><nav><Link href="/app/dashboard">Dashboard</Link><Link href="/app/stock">Stock</Link><Link href="/app">Processing</Link></nav><span>{session.name} · {session.role}</span></header>;
}
