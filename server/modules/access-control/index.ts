export { CAPABILITIES, type Capability } from './domain/capability';
export {
  SYSTEM_ROLE_CAPABILITIES,
  capabilitiesFromPermissionMatrix,
  resolveEffectiveCapabilities,
} from './application/resolveEffectiveCapabilities';
export { hasCapability, requireCapability, requireAnyCapability } from './http/requireCapability';
export { listRoles, RoleReadError } from './application/roleReadModel';
export {
  createCustomRole,
  deactivateCustomRole,
  normalizePermissions,
  reactivateCustomRole,
  updateCustomRole,
  CustomRoleError,
  type CustomRoleErrorCode,
} from './application/manageCustomRoles';
