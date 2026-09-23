// Shared capability definitions for Worker API and Next.js UI.
// Per-user overrides can be layered on top of ROLE_CAPABILITIES in a future release.

export const ROLES = [
  'owner',
  'admin',
  'manager',
  'accountant',
  'gate_operator',
  'production_operator',
  'viewer',
  'operator',
] as const;

export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'dashboard:view',
  'gate:view',
  'gate:create',
  'gate:edit',
  'parties:view',
  'parties:create',
  'parties:edit',
  'parties:archive',
  'items:view',
  'items:create',
  'items:edit',
  'items:archive',
  'stock:view',
  'stock:create',
  'stock:edit',
  'stock:receive',
  'stock:void',
  'processing:view',
  'processing:create',
  'processing:edit',
  'processing:void',
  'processing:configure',
  'saudas:view',
  'saudas:create',
  'saudas:edit',
  'saudas:void',
  'saudas:archive',
  'saudas:restore',
  'payments:view',
  'payments:create',
  'payments:void',
  'documents:view',
  'documents:create',
  'documents:void',
  'documents:upload',
  'documents:export',
  'finance:view',
  'finance:export',
  'billing:view',
  'billing:manage',
  'team:view',
  'team:manage',
  'organisation:view',
  'organisation:manage',
  'settings:view',
  'settings:manage',
  'digest:view',
  'audit:view',
  'export:operational',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL_CAPABILITIES = new Set<Capability>(CAPABILITIES);

const OPERATIONAL_EXPORT: Capability[] = ['export:operational'];

const MANAGER_CAPABILITIES: Capability[] = [
  'dashboard:view',
  'gate:view', 'gate:create', 'gate:edit',
  'parties:view', 'parties:create', 'parties:edit', 'parties:archive',
  'items:view', 'items:create', 'items:edit', 'items:archive',
  'stock:view', 'stock:create', 'stock:edit', 'stock:receive', 'stock:void',
  'processing:view', 'processing:create', 'processing:edit', 'processing:void',
  'digest:view',
  'settings:view',
  ...OPERATIONAL_EXPORT,
];

const ACCOUNTANT_CAPABILITIES: Capability[] = [
  'dashboard:view',
  'parties:view',
  'items:view',
  'stock:view',
  'saudas:view', 'saudas:create', 'saudas:edit', 'saudas:void', 'saudas:archive',
  'payments:view', 'payments:create', 'payments:void',
  'documents:view', 'documents:create', 'documents:void', 'documents:upload', 'documents:export',
  'finance:view', 'finance:export',
  'digest:view',
  'settings:view',
  'gate:view',
];

const GATE_OPERATOR_CAPABILITIES: Capability[] = [
  'dashboard:view',
  'gate:view', 'gate:create', 'gate:edit',
  'parties:view',
  'items:view',
  'saudas:view',
  'settings:view',
];

const PRODUCTION_OPERATOR_CAPABILITIES: Capability[] = [
  'dashboard:view',
  'processing:view', 'processing:create', 'processing:edit',
  'stock:view', 'stock:create', 'stock:edit', 'stock:receive',
  'items:view',
  'settings:view',
];

const VIEWER_CAPABILITIES: Capability[] = [
  'dashboard:view',
  'gate:view',
  'parties:view',
  'items:view',
  'stock:view',
  'processing:view',
  'digest:view',
  'settings:view',
];

const LEGACY_OPERATOR_CAPABILITIES: Capability[] = [
  ...GATE_OPERATOR_CAPABILITIES.filter((c) => c !== 'saudas:view'),
  'processing:view', 'processing:create', 'processing:edit',
  'stock:view', 'stock:create', 'stock:edit', 'stock:receive',
];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: CAPABILITIES,
  admin: CAPABILITIES,
  manager: MANAGER_CAPABILITIES,
  accountant: ACCOUNTANT_CAPABILITIES,
  gate_operator: GATE_OPERATOR_CAPABILITIES,
  production_operator: PRODUCTION_OPERATOR_CAPABILITIES,
  viewer: VIEWER_CAPABILITIES,
  operator: LEGACY_OPERATOR_CAPABILITIES,
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  gate_operator: 'Gate operator',
  production_operator: 'Production operator',
  viewer: 'Viewer',
  operator: 'Operator',
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'dashboard:view': 'Dashboard',
  'gate:view': 'Gate & weighbridge',
  'gate:create': 'Create gate entries',
  'gate:edit': 'Update gate entries',
  'parties:view': 'Parties',
  'parties:create': 'Add parties',
  'parties:edit': 'Edit parties',
  'parties:archive': 'Archive parties',
  'items:view': 'Items',
  'items:create': 'Add items',
  'items:edit': 'Edit items',
  'items:archive': 'Archive items',
  'stock:view': 'Stock & lots',
  'stock:create': 'Create lots',
  'stock:edit': 'Adjust lots',
  'stock:receive': 'Receive stock from gate',
  'stock:void': 'Void stock movements',
  'processing:view': 'Processing',
  'processing:create': 'Post production runs',
  'processing:edit': 'Edit production runs',
  'processing:void': 'Void production runs',
  'processing:configure': 'Configure process templates & chains',
  'saudas:view': 'Saudās',
  'saudas:create': 'Create Saudās',
  'saudas:edit': 'Edit Saudās',
  'saudas:void': 'Void Sauda deliveries',
  'saudas:archive': 'Archive Saudās',
  'saudas:restore': 'Restore archived Saudās',
  'payments:view': 'Payments',
  'payments:create': 'Record payments',
  'payments:void': 'Void payments',
  'documents:view': 'Documents',
  'documents:create': 'Create documents',
  'documents:void': 'Void documents',
  'documents:upload': 'Upload documents',
  'documents:export': 'Export documents',
  'finance:view': 'Financial summaries',
  'finance:export': 'Financial exports',
  'billing:view': 'Billing',
  'billing:manage': 'Manage billing',
  'team:view': 'Team',
  'team:manage': 'Manage team',
  'organisation:view': 'Organisation profile',
  'organisation:manage': 'Manage organisation',
  'settings:view': 'Settings',
  'settings:manage': 'Manage settings & archives',
  'digest:view': 'Night digest',
  'audit:view': 'Audit history',
  'export:operational': 'Operational exports',
};

export type NavModule =
  | 'dashboard'
  | 'gate'
  | 'purchase'
  | 'stock'
  | 'parties'
  | 'items'
  | 'processing'
  | 'billing'
  | 'team'
  | 'documents'
  | 'digest'
  | 'settings'
  | 'access';

export const NAV_MODULE_CAPABILITY: Record<NavModule, Capability> = {
  dashboard: 'dashboard:view',
  gate: 'gate:view',
  purchase: 'saudas:view',
  stock: 'stock:view',
  parties: 'parties:view',
  items: 'items:view',
  processing: 'processing:view',
  billing: 'billing:view',
  team: 'team:view',
  documents: 'documents:view',
  digest: 'digest:view',
  settings: 'settings:view',
  access: 'settings:view',
};

export type SessionUser = { role: string; role_code?: string | null };

export function effectiveRole(user: SessionUser): Role | 'unknown' {
  const role = String(user.role_code || user.role || '').toLowerCase();
  return (ROLES as readonly string[]).includes(role) ? (role as Role) : 'unknown';
}

export function capabilitiesFor(user: SessionUser): Capability[] {
  const role = effectiveRole(user);
  if (role === 'unknown') return [];
  return [...ROLE_CAPABILITIES[role]];
}

export function hasCapability(user: SessionUser, capability: Capability): boolean {
  return capabilitiesFor(user).includes(capability);
}

export function canViewFinance(user: SessionUser): boolean {
  const role = effectiveRole(user);
  return role === 'owner' || role === 'admin' || role === 'accountant';
}

export function canManageTeam(user: SessionUser): boolean {
  return hasCapability(user, 'team:manage');
}

export function isOwnerRole(user: SessionUser): boolean {
  return effectiveRole(user) === 'owner';
}

export function canAssignRole(actor: SessionUser, targetRole: string): boolean {
  const role = targetRole.toLowerCase();
  if (!ROLES.includes(role as Role) || role === 'owner') return false;
  const actorRole = effectiveRole(actor);
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return role !== 'owner' && role !== 'admin';
  return false;
}

export function canAccessNav(user: SessionUser, module: NavModule): boolean {
  return hasCapability(user, NAV_MODULE_CAPABILITY[module]);
}

export function groupCapabilitiesForDisplay(caps: Capability[]): { view: string[]; manage: string[] } {
  const view = new Set<string>();
  const manage = new Set<string>();
  for (const cap of caps) {
    const label = CAPABILITY_LABELS[cap];
    if (cap.endsWith(':view')) view.add(label.replace(/^View /, '').split(' · ')[0] || label);
    else manage.add(label);
  }
  return { view: [...view].sort(), manage: [...manage].sort() };
}

export function hasAnyCapability(user: SessionUser, capabilities: Capability[]): boolean {
  return capabilities.some((cap) => hasCapability(user, cap));
}

export function assertCapabilitySet(): void {
  for (const role of ROLES) {
    for (const cap of ROLE_CAPABILITIES[role]) {
      if (!ALL_CAPABILITIES.has(cap)) throw new Error(`Unknown capability ${cap} on role ${role}`);
    }
  }
}

assertCapabilitySet();
