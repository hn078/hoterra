import bcrypt from 'bcryptjs';
import { AuditAction } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveEffectiveCapabilities } from '../../access-control';

type AuthenticationDatabase = typeof DatabaseModule.prisma;
export type AuthenticationErrorCode = 'INVALID_INPUT' | 'INVALID_CREDENTIALS' | 'NOT_FOUND';

export class AuthenticationError extends Error {
  constructor(public readonly code: AuthenticationErrorCode) {
    super(code);
    this.name = 'AuthenticationError';
  }
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('hoterra-invalid-password', 12);

function accountDto(user: any, capabilities: readonly string[]) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    role: user.role,
    customRole: user.customRole
      ? {
          id: user.customRole.id,
          name: user.customRole.name,
          baseRole: user.customRole.baseRole,
          permissions: user.customRole.permissions,
        }
      : null,
    hasSignature: Boolean(user.signatureImage),
    department: user.department
      ? {
          id: user.department.id,
          name: user.department.name,
          code: user.department.code,
          color: user.department.color,
          isActive: user.department.isActive,
          deactivatedAt: user.department.deactivatedAt,
        }
      : null,
    capabilities,
  };
}

export async function authenticateAccount(
  database: AuthenticationDatabase,
  input: unknown,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw new AuthenticationError('INVALID_INPUT');
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (!email || !password || email.length > 254 || password.length > 256) {
    throw new AuthenticationError('INVALID_CREDENTIALS');
  }

  const [user, settings] = await Promise.all([
    database.user.findFirst({
      where: { email },
      include: { department: true, customRole: true },
    }),
    database.systemSettings.findFirst({ select: { autoLogoutMinutes: true } }),
  ]);
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user?.isActive || !valid) throw new AuthenticationError('INVALID_CREDENTIALS');

  const capabilities = resolveEffectiveCapabilities(user.role, user.customRole);
  const actor: AuthUser = {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    departmentId: user.departmentId,
    customRoleId: user.customRoleId,
    capabilities,
  };
  await database.auditLog.create({
    data: {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: AuditAction.LOGIN,
      ipAddress: metadata.ipAddress,
      device: metadata.userAgent?.slice(0, 200),
    },
  });
  const sessionLifetimeMinutes = Math.max(5, Math.min(1440, settings?.autoLogoutMinutes ?? 30));
  return {
    actor,
    tokenVersion: user.tokenVersion,
    sessionLifetimeSeconds: sessionLifetimeMinutes * 60,
    user: accountDto(user, capabilities),
  };
}

export async function getAuthenticatedAccount(database: AuthenticationDatabase, actor: AuthUser) {
  const user = await database.user.findUnique({
    where: { id: actor.id },
    include: { department: true, customRole: true },
  });
  if (!user?.isActive) throw new AuthenticationError('NOT_FOUND');
  const capabilities = resolveEffectiveCapabilities(user.role, user.customRole);
  return accountDto(user, capabilities);
}

export async function revokeAccountTokens(
  database: AuthenticationDatabase,
  actor: AuthUser,
  ipAddress?: string,
) {
  return database.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: actor.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.LOGOUT,
        ipAddress,
        details: 'Revoked all active bearer tokens for the account',
      },
    });
    return { success: true };
  });
}
