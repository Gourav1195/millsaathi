'use client';

import { usePathname } from 'next/navigation';
import { AppLink } from './app-link';
import { canAccessNav, type NavModule } from '../lib/permissions';
import { useSession } from '../lib/session';

const ROUTE_MODULES: Array<{ prefix: string; module: NavModule; label: string; fallback: string }> = [
  { prefix: '/app/dashboard', module: 'dashboard', label: 'Dashboard', fallback: '/app/gate' },
  { prefix: '/app/gate', module: 'gate', label: 'Gate & Weighbridge', fallback: '/app/dashboard' },
  { prefix: '/app/purchase', module: 'purchase', label: 'Purchase & Saudas', fallback: '/app/dashboard' },
  { prefix: '/app/stock', module: 'stock', label: 'Stock & Lots', fallback: '/app/dashboard' },
  { prefix: '/app/parties', module: 'parties', label: 'Parties', fallback: '/app/dashboard' },
  { prefix: '/app/items', module: 'items', label: 'Items', fallback: '/app/dashboard' },
  { prefix: '/app/processing', module: 'processing', label: 'Processing', fallback: '/app/dashboard' },
  { prefix: '/app/mill-intelligence', module: 'processing', label: 'Mill Intelligence (Beta)', fallback: '/app/dashboard' },
  { prefix: '/app/billing', module: 'billing', label: 'Billing', fallback: '/app/dashboard' },
  { prefix: '/app/team', module: 'team', label: 'Team', fallback: '/app/dashboard' },
  { prefix: '/app/documents', module: 'documents', label: 'Documents', fallback: '/app/dashboard' },
  { prefix: '/app/digest', module: 'digest', label: 'Night Digest', fallback: '/app/dashboard' },
  { prefix: '/app/settings', module: 'settings', label: 'Settings', fallback: '/app/dashboard' },
  { prefix: '/app/access', module: 'access', label: 'My access', fallback: '/app/dashboard' },
];

function routeAccess(pathname: string) {
  if (pathname === '/app') {
    return ROUTE_MODULES.find((entry) => entry.prefix === '/app/processing')!;
  }
  return ROUTE_MODULES.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
}

function sessionUser(session: { role: string }) {
  return { role: session.role, role_code: session.role };
}

function firstAllowedRoute(session: { role: string; capabilities?: string[] }) {
  const user = sessionUser(session);
  for (const entry of ROUTE_MODULES) {
    if (canAccessNav(user, entry.module)) return entry.prefix === '/app/processing' ? '/app' : entry.prefix;
  }
  return '/app/access';
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();
  if (!session) return <>{children}</>;

  const access = routeAccess(pathname);
  if (!access) return <>{children}</>;

  if (canAccessNav(sessionUser(session), access.module)) return <>{children}</>;

  const allowed = firstAllowedRoute(session);
  return (
    <main className="shell">
      <section className="workspace" style={{ maxWidth: 720, margin: '48px auto' }}>
        <h1>You do not have access to this area</h1>
        <p className="muted">
          Your role cannot open {access.label}. Use a module you are allowed to view, or review your permissions on My access.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <AppLink className="ui-button primary" href={allowed}>Go to an allowed page</AppLink>
          <AppLink className="ui-button" href="/app/access">View my access</AppLink>
        </div>
      </section>
    </main>
  );
}
