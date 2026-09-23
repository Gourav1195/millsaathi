'use client';

import { AppLink } from './app-link';
import { usePathname } from 'next/navigation';
import type { Session } from '../lib/session';

type IconName = 'dashboard' | 'gate' | 'purchase' | 'stock' | 'suppliers' | 'buyers' | 'items' | 'processing' | 'billing' | 'team' | 'documents' | 'digest';
type NavigationItem = { label: string; href: string; icon: IconName } | { divider: true };

const navigation: NavigationItem[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: 'dashboard' }, { label: 'Gate & Weighbridge', href: '/app/gate', icon: 'gate' },
  { label: 'Purchase & Saudas', href: '/app/purchase', icon: 'purchase' }, { label: 'Stock & Lots', href: '/app/stock', icon: 'stock' },
  { label: 'Suppliers', href: '/app/parties?type=suppliers', icon: 'suppliers' }, { label: 'Buyers', href: '/app/parties?type=buyers', icon: 'buyers' },
  { label: 'Items', href: '/app/items', icon: 'items' }, { label: 'Processing', href: '/app', icon: 'processing' }, { divider: true },
  { label: 'Billing', href: '/app/billing', icon: 'billing' }, { label: 'Team', href: '/app/team', icon: 'team' },
  { label: 'Documents', href: '/app/documents', icon: 'documents' }, { label: 'Night Digest', href: '/app/digest', icon: 'digest' },
];

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.9 } as const;
  if (name === 'dashboard') return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5" {...stroke}/><rect x="14" y="3" width="7" height="5" rx="1.5" {...stroke}/><rect x="14" y="12" width="7" height="9" rx="1.5" {...stroke}/><rect x="3" y="16" width="7" height="5" rx="1.5" {...stroke}/></svg>;
  if (name === 'gate') return <svg {...common}><path d="M12 3v3M5 9h14l-2 7H7L5 9Z" {...stroke} strokeLinejoin="round"/><path d="M4 20h16" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'purchase' || name === 'billing') return <svg {...common}><path d="M5 4h14v16H5z" {...stroke}/><path d="M8 9h8M8 13h8M8 17h5" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'stock') return <svg {...common}><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" {...stroke} strokeLinejoin="round"/><path d="M3 8l9 5 9-5M12 13v8" {...stroke}/></svg>;
  if (name === 'suppliers') return <svg {...common}><circle cx="12" cy="8" r="3.5" {...stroke}/><path d="M5 20a7 7 0 0 1 14 0" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'buyers') return <svg {...common}><path d="M4 8h16l-1.4 10.5A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.5L4 8Z" {...stroke} strokeLinejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'items') return <svg {...common}><path d="M4 7h16v13H4z" {...stroke}/><path d="M9 7V4h6v3M4 12h16" {...stroke}/></svg>;
  if (name === 'processing') return <svg {...common}><path d="M4 5h6v6H4zM14 13h6v6h-6zM10 8h4v8h-4z" {...stroke}/></svg>;
  if (name === 'team') return <svg {...common}><circle cx="9" cy="8" r="3" {...stroke}/><circle cx="17" cy="9" r="2.5" {...stroke}/><path d="M3 20a6 6 0 0 1 12 0M15 20a4 4 0 0 1 6 0" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'documents') return <svg {...common}><path d="M6 3h9l3 3v15H6z" {...stroke}/><path d="M9 11h6M9 15h6M9 7h4" {...stroke} strokeLinecap="round"/></svg>;
  return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" {...stroke}/><path d="M10 5h4" {...stroke} strokeLinecap="round"/></svg>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function AppHeader({ session }: { session: Session }) {
  const pathname = usePathname();
  const active = (href: string) => {
    const path = href.split('?')[0];
    return path === '/app' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <aside className="app-sidebar" aria-label="Application sidebar">
      <div className="app-sidebar-logo">
        <span className="app-sidebar-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 20V9l8-5 8 5v11" stroke="#1B2431" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M9 20v-5h6v5" stroke="#1B2431" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
        </span>
        <div className="app-sidebar-brand">
          <div className="app-sidebar-title">MillSaathi</div>
          <div className="app-sidebar-mill">{session.mill.name}</div>
        </div>
      </div>

      <nav className="app-sidebar-nav ms-scroll" aria-label="Application navigation">
        {navigation.map((item, index) =>
          'divider' in item ? (
            <div className="nav-divider" role="separator" key={`divider-${index}`} />
          ) : (
            <AppLink key={item.label} href={item.href} className={active(item.href) ? 'active' : ''}>
              <NavIcon name={item.icon} />
              {item.label}
            </AppLink>
          )
        )}
      </nav>

      <div className="app-sidebar-user">
        <div className="app-sidebar-avatar" aria-hidden="true">{initials(session.name)}</div>
        <div className="app-sidebar-user-meta">
          <div className="app-sidebar-user-name">{session.name}</div>
          <div className="app-sidebar-user-role">{session.role.replaceAll('_', ' ')}</div>
        </div>
      </div>
    </aside>
  );
}
