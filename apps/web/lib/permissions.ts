import { hasCapability, type Capability } from '../../../shared/permissions';

export {
  CAPABILITIES,
  CAPABILITY_LABELS,
  NAV_MODULE_CAPABILITY,
  ROLE_CAPABILITIES,
  ROLE_LABELS,
  ROLES,
  canAccessNav,
  canAssignRole,
  canManageTeam,
  canViewFinance,
  capabilitiesFor,
  effectiveRole,
  groupCapabilitiesForDisplay,
  hasAnyCapability,
  hasCapability,
  isOwnerRole,
} from '../../../shared/permissions';
export type { Capability, NavModule, Role, SessionUser } from '../../../shared/permissions';

type SessionLike = { role: string; capabilities?: string[] } | null | undefined;

export function can(session: SessionLike, capability: Capability): boolean {
  if (!session) return false;
  if (session.capabilities?.length) return session.capabilities.includes(capability);
  return hasCapability({ role: session.role, role_code: session.role }, capability);
}
