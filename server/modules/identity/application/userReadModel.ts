import { Prisma, Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { documentReadScope } from '../../documents';
import { searchUserSelect, toSearchUserDto } from './userDtos';

type IdentityDatabase = typeof DatabaseModule.prisma;

export class UserReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
    this.name = 'UserReadError';
  }
}

export async function listUserDirectory(database: IdentityDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('users.directory.read')) throw new UserReadError('FORBIDDEN');
  const canManageLifecycle = actor.capabilities.includes('users.deactivate');
  const departmentScope = actor.role === Role.HOD
    ? actor.departmentId || '__unassigned_hod__'
    : undefined;
  const documentScope = documentReadScope(actor) as Prisma.DocumentWhereInput;
  return database.user.findMany({
    where: {
      ...(!canManageLifecycle ? { isActive: true } : {}),
      ...(departmentScope ? { departmentId: departmentScope } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      role: true,
      isActive: true,
      customRole: { select: { id: true, name: true, baseRole: true } },
      department: { select: { id: true, name: true, code: true, color: true, isActive: true, deactivatedAt: true } },
      createdAt: true,
      _count: {
        select: {
          documents: { where: documentScope },
          signatures: { where: { document: { is: documentScope } } },
        },
      },
    },
    orderBy: { lastName: 'asc' },
  });
}

export async function searchUserDirectory(
  database: IdentityDatabase,
  actor: AuthUser,
  query: string,
  options?: { dateFrom?: Date; departmentId?: string; createdByMe?: boolean },
) {
  if (!actor.capabilities.includes('users.directory.read')) return [];
  const departmentScope = actor.role === Role.HOD
    ? actor.departmentId || '__unassigned_hod__'
    : options?.departmentId;
  const users = await database.user.findMany({
    where: {
      isActive: true,
      ...(departmentScope ? { departmentId: departmentScope } : {}),
      ...(options?.dateFrom ? { createdAt: { gte: options.dateFrom } } : {}),
      ...(options?.createdByMe ? { id: actor.id } : {}),
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { jobTitle: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: searchUserSelect,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 10,
  });
  return users.map(toSearchUserDto);
}

export async function getUserProfile(database: IdentityDatabase, actor: AuthUser, userId: string) {
  const canReadAudit = actor.id === userId || actor.capabilities.includes('audit.read');
  const documentScope = documentReadScope(actor) as Prisma.DocumentWhereInput;
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      role: true,
      signatureImage: true,
      customRole: { select: { id: true, name: true, baseRole: true } },
      departmentId: true,
      department: { select: { id: true, name: true, code: true, color: true, isActive: true, deactivatedAt: true } },
      createdAt: true,
      _count: {
        select: {
          documents: { where: documentScope },
          signatures: { where: { document: { is: documentScope } } },
          auditLogs: canReadAudit,
        },
      },
    },
  });
  if (!user) throw new UserReadError('NOT_FOUND');
  const canView = actor.id === userId || (
    actor.capabilities.includes('users.directory.read') &&
    (actor.role !== Role.HOD || actor.departmentId === user.departmentId)
  );
  if (!canView) throw new UserReadError('FORBIDDEN');

  const [recentActivity, recentDocs] = await Promise.all([
    canReadAudit
      ? database.auditLog.findMany({
          where: { userId },
          select: {
            id: true,
            action: true,
            entityType: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
    database.document.findMany({
      where: {
        AND: [
          documentReadScope(actor),
          { authorId: userId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        code: true,
        updatedAt: true,
        department: { select: { id: true, name: true, code: true, color: true, isActive: true, deactivatedAt: true } },
      },
    }),
  ]);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    role: user.role,
    customRole: user.customRole,
    ...(actor.id === userId ? { hasSignature: Boolean(user.signatureImage) } : {}),
    department: user.department,
    createdAt: user.createdAt,
    counts: {
      documents: user._count.documents,
      signatures: user._count.signatures,
      auditLogs: canReadAudit ? user._count.auditLogs : 0,
    },
    recentActivity,
    recentDocs,
  };
}
