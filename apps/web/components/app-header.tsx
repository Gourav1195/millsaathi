'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from '../lib/session';

const navigation = [
  ['Dashboard', '/app/dashboard', '◆'],
  ['Gate & weighbridge', '/app/gate', '↕'],
  ['Saudās', '/app/purchase', '₹'],
  ['Stock', '/app/stock', '▣'],
  ['Processing', '/app', '◌'],
  ['Parties', '/app/parties', '◉'],
  ['Items', '/app/items', '◇'],
  ['Documents', '/app/documents', '▤'],
  ['Night digest', '/app/digest', '☾'],
  ['Team', '/app/team', '♙'],
];

export function AppHeader({ session }: { session: Session }) {
  const pathname = usePathname();
  const active = (href: string) => href === '/app' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return <aside className="app-sidebar"><Link className="app-brand" href="/app/dashboard"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-5h6v5"/><path d="M12 4v3"/></svg></span><span>MillSaathi</span></Link><div className="mill-name">{session.mill.name}</div><nav className="app-nav" aria-label="Application navigation">{navigation.map(([label, href, icon]) => <Link key={href} href={href} className={active(href) ? 'active' : ''}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav><div className="sidebar-user"><span className="user-initial">{session.name.slice(0, 1).toUpperCase()}</span><span><strong>{session.name}</strong><small>{session.role.replaceAll('_', ' ')}</small></span></div></aside>;
}
