'use client';

import { AppLink } from './app-link';
import { usePathname } from 'next/navigation';
import { canAccessNav, type NavModule } from '../lib/permissions';
import { useOperationalCounts } from '../lib/operational-counts';
import type { Session } from '../lib/session';

type IconName = 'dashboard' | 'gate' | 'purchase' | 'stock' | 'parties' | 'items' | 'processing' | 'billing' | 'team' | 'documents' | 'digest' | 'settings' | 'access';
type NavigationItem =
  | { label: string; href: string; icon: IconName; module: NavModule }
  | { divider: true };

const navigation: NavigationItem[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: 'dashboard', module: 'dashboard' },
  { label: 'Gate & Weighbridge', href: '/app/gate', icon: 'gate', module: 'gate' },
  { label: 'Purchase & Saudas', href: '/app/purchase', icon: 'purchase', module: 'purchase' },
  { label: 'Stock & Lots', href: '/app/stock', icon: 'stock', module: 'stock' },
  { label: 'Parties', href: '/app/parties', icon: 'parties', module: 'parties' },
  { label: 'Items', href: '/app/items', icon: 'items', module: 'items' },
  { label: 'Processing', href: '/app', icon: 'processing', module: 'processing' },
  { divider: true },
  { label: 'Billing', href: '/app/billing', icon: 'billing', module: 'billing' },
  { label: 'Team', href: '/app/team', icon: 'team', module: 'team' },
  { label: 'Documents', href: '/app/documents', icon: 'documents', module: 'documents' },
  { label: 'Night Digest', href: '/app/digest', icon: 'digest', module: 'digest' },
  { divider: true },
  { label: 'Settings', href: '/app/settings', icon: 'settings', module: 'settings' },
  { label: 'My access', href: '/app/access', icon: 'access', module: 'access' },
];

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.9 } as const;
  if (name === 'dashboard') return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5" {...stroke}/><rect x="14" y="3" width="7" height="5" rx="1.5" {...stroke}/><rect x="14" y="12" width="7" height="9" rx="1.5" {...stroke}/><rect x="3" y="16" width="7" height="5" rx="1.5" {...stroke}/></svg>;
  if (name === 'gate') return <svg {...common}><path d="M12 3v3M5 9h14l-2 7H7L5 9Z" {...stroke} strokeLinejoin="round"/><path d="M4 20h16" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'purchase' || name === 'billing') return <svg {...common}><path d="M5 4h14v16H5z" {...stroke}/><path d="M8 9h8M8 13h8M8 17h5" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'stock') return <svg {...common}><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" {...stroke} strokeLinejoin="round"/><path d="M3 8l9 5 9-5M12 13v8" {...stroke}/></svg>;
  if (name === 'parties') return <svg {...common}><circle cx="9" cy="8" r="2.8" {...stroke}/><circle cx="16" cy="9" r="2.2" {...stroke}/><path d="M4 20a5 5 0 0 1 10 0M12 20a4 4 0 0 1 8 0" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'items') return <svg {...common}><path d="M4 7h16v13H4z" {...stroke}/><path d="M9 7V4h6v3M4 12h16" {...stroke}/></svg>;
  if (name === 'processing') return <svg {...common}><path d="M4 5h6v6H4zM14 13h6v6h-6zM10 8h4v8h-4z" {...stroke}/></svg>;
  if (name === 'team') return <svg {...common}><circle cx="9" cy="8" r="3" {...stroke}/><circle cx="17" cy="9" r="2.5" {...stroke}/><path d="M3 20a6 6 0 0 1 12 0M15 20a4 4 0 0 1 6 0" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'documents') return <svg {...common}><path d="M6 3h9l3 3v15H6z" {...stroke}/><path d="M9 11h6M9 15h6M9 7h4" {...stroke} strokeLinecap="round"/></svg>;
  if (name === 'access') return <svg {...common}><path d="M12 3a5 5 0 0 0-5 5v2H5v11h14V10h-2V8a5 5 0 0 0-5-5Z" {...stroke} strokeLinejoin="round"/><circle cx="12" cy="15" r="2" {...stroke}/></svg>;
  if (name === 'settings') return (
    <svg {...common}>
      <path
        d="M10.8 2.5h2.4l.45 2.05a7.4 7.4 0 0 1 1.85.95l1.85-.82 1.2 2.08-.82 1.85c.42.58.76 1.22.95 1.85l2.05.45v2.4l-2.05.45a7.4 7.4 0 0 1-.95 1.85l.82 1.85-1.2 2.08-1.85-.82a7.4 7.4 0 0 1-1.85.95l-.45 2.05h-2.4l-.45-2.05a7.4 7.4 0 0 1-1.85-.95l-1.85.82-1.2-2.08.82-1.85a7.4 7.4 0 0 1-.95-1.85l-2.05-.45v-2.4l2.05-.45c.19-.63.53-1.27.95-1.85l-.82-1.85 1.2-2.08 1.85.82c.58-.42 1.22-.76 1.85-.95l.45-2.05Z"
        {...stroke}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.8" {...stroke} />
    </svg>
  );
  return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" {...stroke}/><path d="M10 5h4" {...stroke} strokeLinecap="round"/></svg>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function AppHeader({ session }: { session: Session }) {
  const pathname = usePathname();
  const { pendingStockReceipts } = useOperationalCounts();
  const user = { role: session.role, role_code: session.role };
  const visibleNavigation = navigation.filter((item) => ('divider' in item ? true : canAccessNav(user, item.module)));
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
        {visibleNavigation.map((item, index) => {
          if ('divider' in item) {
            const prev = visibleNavigation[index - 1];
            const next = visibleNavigation[index + 1];
            if (!prev || !next || 'divider' in prev || 'divider' in next) return null;
            return <div className="nav-divider" role="separator" key={`divider-${index}`} />;
          }
          return (
            <AppLink key={item.label} href={item.href} className={active(item.href) ? 'active' : ''}>
              <NavIcon name={item.icon} />
              <span className="app-sidebar-link-label">{item.label}</span>
              {item.icon === 'stock' && pendingStockReceipts > 0 ? (
                <span className="app-nav-badge" aria-label={`${pendingStockReceipts} pending truck${pendingStockReceipts === 1 ? '' : 's'}`}>
                  {pendingStockReceipts}
                </span>
              ) : null}
            </AppLink>
          );
        })}
      </nav>

      <div className="app-sidebar-user">
        <div className="app-sidebar-avatar" aria-hidden="true">{initials(session.name)}</div>
        <div className="app-sidebar-user-meta">
          <div className="app-sidebar-user-name">{session.name}</div>
          <div className="app-sidebar-user-role">{(session.role_label ?? session.role).replaceAll('_', ' ')}</div>
        </div>
      </div>
    </aside>
  );
}
