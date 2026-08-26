import bcrypt from 'bcryptjs';
import { AuditAction, DocumentStatus, Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { authorizeAccountMutation, canAssignPrivilegedRole } from '../domain/accountHierarchy';
import { getTenantPasswordPolicy, passwordPolicyViolation } from '../../settings';
import { serializeAuditState } from '../../audit';

type IdentityDatabase = typeof DatabaseModule.prisma;

export type UserAccountErrorCode =
  | 'FORBIDDEN'
  | 'MISSING_FIELDS'
  | 'INVALID_EMAIL'
  | 'INVALID_PASSWORD'
  | 'INVALID_NAME'
  | 'INVALID_JOB_TITLE'
  | 'INVALID_ROLE'
  | 'EMAIL_EXISTS'
  | 'CUSTOM_ROLE_NOT_FOUND'
  | 'DEPARTMENT_NOT_FOUND'
  | 'NOT_FOUND'
  | 'LAST_SYSTEM_ADMIN'
  | 'OUTSTANDING_RESPONSIBILITIES'
  | 'SELF_MUTATION';

export class UserAccountError extends Error {
  constructor(public readonly code: UserAccountErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'UserAccountError';
  }
}

interface UserAccountInput {
  email?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  jobTitle?: unknown;
  role?: unknown;
  customRoleId?: unknown;
  departmentId?: unknown;
  isActive?: unknown;
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizedName(value: unknown) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 100) throw new UserAccountError('INVALID_NAME');
  return name;
}

function normalizedJobTitle(value: unknown): string {
  const title = String(value ?? '').trim();
  if (!title || title.length > 120) throw new UserAccountError('INVALID_JOB_TITLE');
  return title;
}

function normalizedOptionalId(value: unknown): string | null {
  const id = String(value ?? '').trim();
  return id || null;
}

function assertRole(value: unknown): Role {
  if (!Object.values(Role).includes(value as Role)) throw new UserAccountError('INVALID_ROLE');
  return value as Role;
}

function assertPrivilegedAssignment(actor: AuthUser, role: Role) {
  if (!canAssignPrivilegedRole(actor, role) || (
    (role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER)
    && !actor.capabilities.includes('roles.assign.privileged')
  )) {
    throw new UserAccountError('FORBIDDEN', 'Only a System Administrator can grant this role');
  }
}

function safeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    role: user.role,
    customRole: user.customRole
      ? { id: user.customRole.id, name: user.customRole.name, baseRole: user.customRole.baseRole }
      : null,
    department: user.department
      ? { id: user.department.id, name: user.department.name, code: user.department.code, color: user.department.color }
      : null,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

function accountAuditState(user: any, passwordChanged = false) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    role: user.role,
    customRoleId: user.customRoleId ?? user.customRole?.id ?? null,
    departmentId: user.departmentId ?? user.department?.id ?? null,
    isActive: user.isActive,
    ...(passwordChanged ? { passwordChanged: true } : {}),
  };
}

async function responsibilityCounts(transaction: any, userId: string) {
  const now = new Date();
  const [actionNotifications, returnedDocuments] = await Promise.all([
    transaction.notification.count({
      where: {
        userId,
        actionType: { notIn: ['DOCUMENT_REVISION'] },
        actionCompletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    transaction.document.count({
      where: {
        status: DocumentStatus.NEEDS_REVIEW,
        OR: [
          { ownerId: userId },
          { ownerId: null, authorId: userId },
        ],
      },
    }),
  ]);
  return {
    actionNotifications,
    documentRevisions: returnedDocuments,
    total: actionNotifications + returnedDocuments,
  };
}

export async function getUserResponsibilitySummary(
  database: IdentityDatabase,
  actor: AuthUser,
  userId: string,
) {
  if (!actor.capabilities.includes('users.update')) throw new UserAccountError('FORBIDDEN');
  const target = await database.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw new UserAccountError('NOT_FOUND');
  return responsibilityCounts(database, userId);
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function createUserAccount(database: IdentityDatabase, actor: AuthUser, input: UserAccountInput) {
  if (!actor.capabilities.includes('users.create')) throw new UserAccountError('FORBIDDEN');
  if (!input.email || !input.password || !input.firstName || !input.lastName || !input.jobTitle || !input.role) {
    throw new UserAccountError('MISSING_FIELDS');
  }

  const email = String(input.email).trim().toLowerCase();
  const password = String(input.password);
  if (!validEmail(email)) throw new UserAccountError('INVALID_EMAIL');
  const passwordPolicy = await getTenantPasswordPolicy(database);
  const passwordError = passwordPolicyViolation(password, passwordPolicy);
  if (passwordError) throw new UserAccountError('INVALID_PASSWORD', passwordError);
  const firstName = normalizedName(input.firstName);
  const lastName = normalizedName(input.lastName);
  const jobTitle = normalizedJobTitle(input.jobTitle);
  const requestedRole = assertRole(input.role);
  const customRoleId = normalizedOptionalId(input.customRoleId);
  const departmentId = normalizedOptionalId(input.departmentId);
  assertPrivilegedAssignment(actor, requestedRole);
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    return await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity:user-email:${email}`}))`;
      if (await transaction.user.findFirst({ where: { email }, select: { id: true } })) {
        throw new UserAccountError('EMAIL_EXISTS');
      }
      const customRole = customRoleId
        ? await transaction.customRole.findFirst({ where: { id: customRoleId, isActive: true } })
        : null;
      if (customRoleId && !customRole) throw new UserAccountError('CUSTOM_ROLE_NOT_FOUND');
      if (customRole) assertPrivilegedAssignment(actor, customRole.baseRole);
      if (departmentId && !(await transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } }))) {
        throw new UserAccountError('DEPARTMENT_NOT_FOUND');
      }

      const user = await transaction.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          jobTitle,
          role: customRole?.baseRole ?? requestedRole,
          customRoleId: customRole?.id ?? null,
          departmentId,
        },
        include: { department: true, customRole: true },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.CREATE,
          entityType: 'User',
          entityId: user.id,
          details: `Created user ${user.email} with role ${user.role}`,
          outcome: 'SUCCESS',
          reason: 'Account provisioned by an authorized administrator',
          afterState: serializeAuditState(accountAuditState(user)),
        },
      });
      return safeUser(user);
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new UserAccountError('EMAIL_EXISTS');
    throw error;
  }
}

export async function updateUserAccount(
  database: IdentityDatabase,
  actor: AuthUser,
  userId: string,
  input: UserAccountInput,
) {
  if (!actor.capabilities.includes('users.update')) throw new UserAccountError('FORBIDDEN');
  if (input.isActive !== undefined && !actor.capabilities.includes('users.deactivate')) {
    throw new UserAccountError('FORBIDDEN', 'User lifecycle permission required');
  }
  if (input.password !== undefined && !actor.capabilities.includes('users.password.reset')) {
    throw new UserAccountError('FORBIDDEN', 'Password reset permission required');
  }

  const requestedRole = input.role !== undefined ? assertRole(input.role) : undefined;
  if (requestedRole) assertPrivilegedAssignment(actor, requestedRole);
  const firstName = input.firstName !== undefined ? normalizedName(input.firstName) : undefined;
  const lastName = input.lastName !== undefined ? normalizedName(input.lastName) : undefined;
  const jobTitle = input.jobTitle !== undefined ? normalizedJobTitle(input.jobTitle) : undefined;
  const departmentId = input.departmentId !== undefined ? normalizedOptionalId(input.departmentId) : undefined;
  const customRoleId = input.customRoleId !== undefined ? normalizedOptionalId(input.customRoleId) : undefined;
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') throw new UserAccountError('MISSING_FIELDS');
  const password = input.password !== undefined ? String(input.password) : undefined;
  if (password !== undefined) {
    const passwordPolicy = await getTenantPasswordPolicy(database);
    const passwordError = passwordPolicyViolation(password, passwordPolicy);
    if (passwordError) throw new UserAccountError('INVALID_PASSWORD', passwordError);
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity:user:${userId}`}))`;
    const target = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true, jobTitle: true,
        role: true, customRoleId: true, departmentId: true, isActive: true,
      },
    });
    if (!target) throw new UserAccountError('NOT_FOUND');

    const customRole = customRoleId
      ? await transaction.customRole.findFirst({ where: { id: customRoleId, isActive: true } })
      : null;
    if (customRoleId && !customRole) throw new UserAccountError('CUSTOM_ROLE_NOT_FOUND');
    if (customRole) assertPrivilegedAssignment(actor, customRole.baseRole);
    if (departmentId && !(await transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } }))) {
      throw new UserAccountError('DEPARTMENT_NOT_FOUND');
    }

    const data: Record<string, unknown> = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (jobTitle !== undefined) data.jobTitle = jobTitle;
    if (customRoleId !== undefined) {
      data.customRoleId = customRole?.id ?? null;
      if (customRole) data.role = customRole.baseRole;
      else if (requestedRole) data.role = requestedRole;
    } else if (requestedRole) {
      data.role = requestedRole;
      data.customRoleId = null;
    }
    const nextRole = (data.role as Role | undefined) ?? target.role;
    const nextCustomRoleId = Object.prototype.hasOwnProperty.call(data, 'customRoleId')
      ? data.customRoleId as string | null
      : target.customRoleId;
    const decision = authorizeAccountMutation(actor, target, {
      nextRole,
      nextCustomRoleId,
      nextIsActive: input.isActive as boolean | undefined,
    });
    if (!decision.allowed) {
      throw new UserAccountError(decision.status === 403 ? 'FORBIDDEN' : 'SELF_MUTATION', decision.error);
    }

    const removesActiveSystemAdministrator = target.role === Role.SYSTEM_ADMINISTRATOR && (
      input.isActive === false || nextRole !== Role.SYSTEM_ADMINISTRATOR
    );
    if (target.role === Role.SYSTEM_ADMINISTRATOR || nextRole === Role.SYSTEM_ADMINISTRATOR) {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity:system-admin-lifecycle'))`;
    }
    if (removesActiveSystemAdministrator && target.isActive) {
      const remainingActiveAdministrators = await transaction.user.count({
        where: {
          id: { not: target.id },
          role: Role.SYSTEM_ADMINISTRATOR,
          isActive: true,
        },
      });
      if (remainingActiveAdministrators === 0) throw new UserAccountError('LAST_SYSTEM_ADMIN');
    }

    const changesResponsibilityScope = (
      input.isActive === false ||
      nextRole !== target.role ||
      nextCustomRoleId !== target.customRoleId ||
      (departmentId !== undefined && departmentId !== target.departmentId)
    );
    if (target.isActive && changesResponsibilityScope) {
      const responsibilities = await responsibilityCounts(transaction, target.id);
      if (responsibilities.total > 0) {
        throw new UserAccountError(
          'OUTSTANDING_RESPONSIBILITIES',
          `Complete or reassign ${responsibilities.total} open task${responsibilities.total === 1 ? '' : 's'} before changing this account's access`,
        );
      }
    }

    if (departmentId !== undefined) data.departmentId = departmentId;
    if (input.isActive !== undefined && input.isActive !== target.isActive) {
      data.isActive = input.isActive;
      // Every lifecycle transition invalidates all existing JWTs. This also
      // prevents a token issued before deactivation from reviving later.
      data.tokenVersion = { increment: 1 };
    }
    if (passwordHash) {
      data.passwordHash = passwordHash;
      data.tokenVersion = { increment: 1 };
    }
    const user = await transaction.user.update({
      where: { id: userId },
      data,
      include: { department: true, customRole: true },
    });
    const changedFields = Object.keys(data).filter((field) => field !== 'passwordHash');
    if (passwordHash) changedFields.push('password');
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: user.id,
        details: `Updated user ${user.email}: ${changedFields.join(', ') || 'no fields changed'}`,
        outcome: 'SUCCESS',
        reason: input.isActive === false ? 'Account deactivated'
          : input.isActive === true ? 'Account activated'
            : passwordHash ? 'Account credential reset'
              : 'Account profile or access updated',
        beforeState: serializeAuditState(accountAuditState(target)),
        afterState: serializeAuditState(accountAuditState(user, Boolean(passwordHash))),
      },
    });
    return safeUser(user);
  });
}
