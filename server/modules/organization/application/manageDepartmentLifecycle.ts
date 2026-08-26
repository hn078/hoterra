import { AuditAction, DocumentStatus, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { serializeAuditState } from '../../audit';

type OrganizationDatabase = typeof DatabaseModule.prisma;

export type DepartmentLifecycleErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'ALREADY_ACTIVE'
  | 'ALREADY_INACTIVE'
  | 'TRANSFER_REQUIRED'
  | 'BLOCKED';

export class DepartmentLifecycleError extends Error {
  constructor(public readonly code: DepartmentLifecycleErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'DepartmentLifecycleError';
  }
}

const OPEN_DOCUMENT_STATUSES: DocumentStatus[] = [
  DocumentStatus.DRAFT,
  DocumentStatus.IN_REVIEW,
  DocumentStatus.SIGNED_HOD,
  DocumentStatus.SIGNED_FINANCE,
  DocumentStatus.SIGNED_GM,
  DocumentStatus.NEEDS_REVIEW,
];

const TERMINAL_WORKFORCE_STATUSES: WorkforceRequestStatus[] = [
  WorkforceRequestStatus.REJECTED,
  WorkforceRequestStatus.COMPLETED,
  WorkforceRequestStatus.CANCELLED,
];

function reason(value: unknown) {
  const normalized = String(value ?? '').trim();
  if (normalized.length < 3 || normalized.length > 500) {
    throw new DepartmentLifecycleError('INVALID_INPUT', 'Reason must be 3–500 characters');
  }
  return normalized;
}

async function dependencySummary(transaction: any, departmentId: string) {
  const activeUsers = await transaction.user.findMany({
    where: { departmentId, isActive: true },
    select: { id: true },
  });
  const userIds = activeUsers.map((user: { id: string }) => user.id);
  const now = new Date();
  const [
    openActionTasks,
    returnedDocuments,
    openDocuments,
    openWorkforceRequests,
    activeDocumentTemplates,
    activeWorkforcePositions,
    activeWorkforceTemplates,
  ] = await Promise.all([
    userIds.length ? transaction.notification.count({
      where: {
        userId: { in: userIds },
        actionType: { notIn: ['DOCUMENT_REVISION'] },
        actionCompletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }) : 0,
    userIds.length ? transaction.document.count({
      where: {
        status: DocumentStatus.NEEDS_REVIEW,
        OR: [
          { ownerId: { in: userIds } },
          { ownerId: null, authorId: { in: userIds } },
        ],
      },
    }) : 0,
    transaction.document.count({
      where: { departmentId, status: { in: OPEN_DOCUMENT_STATUSES } },
    }),
    transaction.workforceRequest.count({
      where: { departmentId, status: { notIn: TERMINAL_WORKFORCE_STATUSES } },
    }),
    transaction.template.count({
      where: { departmentId, isActive: true },
    }),
    transaction.workforcePosition.count({
      where: { departmentId, isActive: true },
    }),
    transaction.workforceRequestTemplate.count({
      where: { departmentId, isActive: true },
    }),
  ]);
  const openUserResponsibilities = openActionTasks + returnedDocuments;
  const blockingDependencies = openDocuments
    + openWorkforceRequests
    + activeDocumentTemplates
    + activeWorkforcePositions
    + activeWorkforceTemplates
    + openUserResponsibilities;
  return {
    activeUsers: activeUsers.length,
    openUserResponsibilities,
    openDocuments,
    openWorkforceRequests,
    activeDocumentTemplates,
    activeWorkforcePositions,
    activeWorkforceTemplates,
    blockingDependencies,
    canDeactivate: blockingDependencies === 0,
  };
}

export async function getDepartmentLifecycleSummary(
  database: OrganizationDatabase,
  actor: AuthUser,
  departmentId: string,
) {
  if (!actor.capabilities.includes('departments.manage')) throw new DepartmentLifecycleError('FORBIDDEN');
  const department = await database.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, code: true, isActive: true, deactivatedAt: true },
  });
  if (!department) throw new DepartmentLifecycleError('NOT_FOUND');
  return { ...department, dependencies: await dependencySummary(database, departmentId) };
}

export async function deactivateDepartment(
  database: OrganizationDatabase,
  actor: AuthUser,
  departmentId: string,
  inputValue: unknown,
) {
  if (!actor.capabilities.includes('departments.manage')) throw new DepartmentLifecycleError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const lifecycleReason = reason(input.reason);
  const transferDepartmentId = String(input.transferDepartmentId ?? '').trim() || null;
  if (transferDepartmentId === departmentId) {
    throw new DepartmentLifecycleError('INVALID_INPUT', 'Transfer department must be different');
  }

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`organization:department-lifecycle:${departmentId}`}))`;
    const department = await transaction.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, code: true, isActive: true, deactivatedAt: true },
    });
    if (!department) throw new DepartmentLifecycleError('NOT_FOUND');
    if (!department.isActive) throw new DepartmentLifecycleError('ALREADY_INACTIVE');

    const dependencies = await dependencySummary(transaction, departmentId);
    if (dependencies.blockingDependencies > 0) {
      throw new DepartmentLifecycleError(
        'BLOCKED',
        'Resolve open tasks, documents, Workforce requests, templates, and catalog positions before deactivation',
      );
    }

    let transferDepartment: { id: string; name: string } | null = null;
    if (dependencies.activeUsers > 0) {
      if (!transferDepartmentId) throw new DepartmentLifecycleError('TRANSFER_REQUIRED');
      transferDepartment = await transaction.department.findFirst({
        where: { id: transferDepartmentId, isActive: true },
        select: { id: true, name: true },
      });
      if (!transferDepartment) {
        throw new DepartmentLifecycleError('INVALID_INPUT', 'Transfer department must be active');
      }
    }

    const activeUsers = dependencies.activeUsers > 0
      ? await transaction.user.findMany({ where: { departmentId, isActive: true }, select: { id: true } })
      : [];
    const userIds = activeUsers.map((user) => user.id);
    if (transferDepartment && userIds.length) {
      await transaction.user.updateMany({
        where: { id: { in: userIds }, departmentId, isActive: true },
        data: { departmentId: transferDepartment.id, tokenVersion: { increment: 1 } },
      });
      const sourceConversation = await transaction.conversation.findFirst({
        where: { type: 'DEPARTMENT', departmentId },
        select: { id: true },
      });
      if (sourceConversation) {
        await transaction.conversationParticipant.deleteMany({
          where: { conversationId: sourceConversation.id, userId: { in: userIds } },
        });
      }
      await transaction.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          title: 'Department changed',
          message: `${department.name} was deactivated. Your account was moved to ${transferDepartment!.name}.`,
          type: 'system',
          link: `/departments/${transferDepartment!.id}`,
          entityType: 'Department',
          entityId: transferDepartment!.id,
        })),
      });
    }

    const updated = await transaction.department.update({
      where: { id: departmentId },
      data: { isActive: false, deactivatedAt: new Date() },
      select: { id: true, name: true, code: true, color: true, location: true, description: true, isActive: true, deactivatedAt: true },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'Department',
        entityId: departmentId,
        details: `Deactivated department ${department.name}; transferred ${userIds.length} active user(s)${transferDepartment ? ` to ${transferDepartment.name}` : ''}. Reason: ${lifecycleReason}`,
        outcome: 'SUCCESS',
        reason: lifecycleReason,
        beforeState: serializeAuditState({
          ...department,
          activeUsersTransferred: 0,
          transferDepartmentId: null,
        }),
        afterState: serializeAuditState({
          ...updated,
          activeUsersTransferred: userIds.length,
          transferDepartmentId: transferDepartment?.id ?? null,
        }),
      },
    });
    return updated;
  });
}

export async function reactivateDepartment(
  database: OrganizationDatabase,
  actor: AuthUser,
  departmentId: string,
  inputValue: unknown,
) {
  if (!actor.capabilities.includes('departments.manage')) throw new DepartmentLifecycleError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const lifecycleReason = reason(input.reason);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`organization:department-lifecycle:${departmentId}`}))`;
    const department = await transaction.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, code: true, color: true, location: true, description: true, isActive: true, deactivatedAt: true },
    });
    if (!department) throw new DepartmentLifecycleError('NOT_FOUND');
    if (department.isActive) throw new DepartmentLifecycleError('ALREADY_ACTIVE');
    const updated = await transaction.department.update({
      where: { id: departmentId },
      data: { isActive: true, deactivatedAt: null },
      select: { id: true, name: true, code: true, color: true, location: true, description: true, isActive: true, deactivatedAt: true },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'Department',
        entityId: departmentId,
        details: `Reactivated department ${department.name}. Reason: ${lifecycleReason}`,
        outcome: 'SUCCESS',
        reason: lifecycleReason,
        beforeState: serializeAuditState(department),
        afterState: serializeAuditState(updated),
      },
    });
    return updated;
  });
}
