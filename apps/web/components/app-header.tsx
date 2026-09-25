'use client';

import { AppLink } from './app-link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canAccessNav, type NavModule } from '../lib/permissions';
import { useOperationalCounts } from '../lib/operational-counts';
import { useSession, type Session } from '../lib/session';

type IconName = 'dashboard' | 'gate' | 'purchase' | 'stock' | 'parties' | 'items' | 'processing' | 'billing' | 'team' | 'documents' | 'digest' | 'settings';
type NavigationLink = { label: string; href: string; icon: IconName; module: NavModule };

const navigationSections: NavigationLink[][] = [
  [
    { label: 'Dashboard', href: '/app', icon: 'dashboard', module: 'dashboard' },
    { label: 'Purchase & Saudas', href: '/app/purchase', icon: 'purchase', module: 'purchase' },
    { label: 'Gate & Weighbridge', href: '/app/gate', icon: 'gate', module: 'gate' },
    { label: 'Stock & Lots', href: '/app/stock', icon: 'stock', module: 'stock' },
    { label: 'Processing', href: '/app/processing', icon: 'processing', module: 'processing' },
    { label: 'Mill Intelligence (Beta)', href: '/app/mill-intelligence', icon: 'processing', module: 'processing' },
  ],
  [
    { label: 'Parties', href: '/app/parties', icon: 'parties', module: 'parties' },
    { label: 'Items', href: '/app/items', icon: 'items', module: 'items' },
    { label: 'Team', href: '/app/team', icon: 'team', module: 'team' },
    { label: 'Documents', href: '/app/documents', icon: 'documents', module: 'documents' },
    { label: 'Night Digest', href: '/app/digest', icon: 'digest', module: 'digest' },
    { label: 'Billing', href: '/app/billing', icon: 'billing', module: 'billing' },
  ],
];

const footerNavigation: NavigationLink[] = [
  { label: 'Settings', href: '/app/settings', icon: 'settings', module: 'settings' },
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

const SIDEBAR_COLLAPSED_KEY = 'millsaathi-sidebar-collapsed';

function SidebarCollapseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M13 8l4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppHeader({ session }: { session: Session }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setSession } = useSession();
  const { pendingStockReceipts } = useOperationalCounts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const user = { role: session.role, role_code: session.role };
  const visibleSections = navigationSections
    .map((section) => section.filter((item) => canAccessNav(user, item.module)))
    .filter((section) => section.length > 0);
  const visibleFooterNavigation = footerNavigation.filter((item) => canAccessNav(user, item.module));
  const active = (href: string) => {
    const path = href.split('?')[0];
    return path === '/app' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const collapseSidebar = useCallback(() => setSidebarCollapsed(true), []);
  const expandSidebar = useCallback(() => setSidebarCollapsed(false), []);
  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setSession(null);
      closeMenu();
      router.push('/app');
    } catch {
      setLoggingOut(false);
    }
  }, [closeMenu, loggingOut, router, setSession]);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    } catch {
      // Ignore storage access errors.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = sidebarCollapsed ? 'true' : 'false';
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    } catch {
      // Ignore storage access errors.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="app-topbar">
        <button
          ref={toggleRef}
          type="button"
          className="app-topbar-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <AppLink href="/app" className="app-topbar-brand" onClick={closeMenu}>
          <div className="app-topbar-title">MillSaathi</div>
          <div className="app-topbar-mill">{session.mill.name}</div>
        </AppLink>
        <div className="app-topbar-avatar" aria-hidden="true">{initials(session.name)}</div>
      </header>

      <div
        className="app-sidebar-backdrop"
        data-open={menuOpen ? 'true' : 'false'}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <aside
        id="app-sidebar"
        className="app-sidebar"
        data-open={menuOpen ? 'true' : 'false'}
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        aria-label="Application sidebar"
        aria-expanded={sidebarCollapsed ? 'false' : 'true'}
      >
      <div className="app-sidebar-logo-row">
        <AppLink
          href="/app"
          className="app-sidebar-logo"
          onClick={(event) => {
            if (sidebarCollapsed) {
              event.preventDefault();
              expandSidebar();
              return;
            }
            closeMenu();
          }}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'MillSaathi dashboard'}
          title={sidebarCollapsed ? 'Expand sidebar' : undefined}
        >
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
        </AppLink>
        <button
          type="button"
          className="app-sidebar-collapse-btn"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onClick={collapseSidebar}
        >
          <SidebarCollapseIcon />
        </button>
      </div>

      <nav className="app-sidebar-nav" aria-label="Application navigation">
        {visibleSections.map((section, sectionIndex) => (
          <div className="app-sidebar-nav-section" key={section.map((item) => item.label).join('-')}>
            {sectionIndex > 0 ? <div className="nav-divider" role="separator" /> : null}
            {section.map((item) => (
              <AppLink
                key={item.label}
                href={item.href}
                className={active(item.href) ? 'active' : ''}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={closeMenu}
              >
                <NavIcon name={item.icon} />
                <span className="app-sidebar-link-label">{item.label}</span>
                {item.icon === 'stock' && pendingStockReceipts > 0 ? (
                  <span className="app-nav-badge" aria-label={`${pendingStockReceipts} pending truck${pendingStockReceipts === 1 ? '' : 's'}`}>
                    {pendingStockReceipts}
                  </span>
                ) : null}
              </AppLink>
            ))}
          </div>
        ))}
      </nav>

      {visibleFooterNavigation.length ? (
        <div className="app-sidebar-footer-nav">
          <div className="nav-divider" role="separator" />
          {visibleFooterNavigation.map((item) => (
            <AppLink
              key={item.label}
              href={item.href}
              className={active(item.href) ? 'active' : ''}
              title={sidebarCollapsed ? item.label : undefined}
              onClick={closeMenu}
            >
              <NavIcon name={item.icon} />
              <span className="app-sidebar-link-label">{item.label}</span>
            </AppLink>
          ))}
        </div>
      ) : null}

      <div className="app-sidebar-user" title={sidebarCollapsed ? session.name : undefined}>
        <div className="app-sidebar-avatar" aria-hidden="true">{initials(session.name)}</div>
        <div className="app-sidebar-user-meta">
          <div className="app-sidebar-user-name">{session.name}</div>
          <div className="app-sidebar-user-role">{(session.role_label ?? session.role).replaceAll('_', ' ')}</div>
        </div>
        <button
          type="button"
          className="app-sidebar-logout-btn"
          aria-label="Log out"
          title="Log out"
          disabled={loggingOut}
          onClick={() => void logout()}
        >
          <LogoutIcon />
        </button>
      </div>
      </aside>
    </>
  );
}
