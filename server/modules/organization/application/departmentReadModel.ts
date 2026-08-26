import { Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { formatWorkflow } from '../../workflow';

type OrganizationDatabase = typeof DatabaseModule.prisma;

export class DepartmentReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
    this.name = 'DepartmentReadError';
  }
}

function canReadDetail(actor: AuthUser, departmentId: string) {
  return actor.capabilities.includes('documents.read.all')
    || (actor.capabilities.includes('documents.read') && actor.departmentId === departmentId);
}

function canListAllDepartments(actor: AuthUser) {
  return actor.capabilities.includes('documents.read.all')
    || actor.capabilities.includes('departments.manage')
    || actor.capabilities.includes('users.create');
}

function personDto(person: any, includeEmail: boolean) {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    jobTitle: person.jobTitle,
    role: person.role,
    ...(includeEmail ? { email: person.email } : {}),
  };
}

export async function listDepartments(
  database: OrganizationDatabase,
  actor: AuthUser,
  options?: { includeInactive?: boolean },
) {
  if (!actor.capabilities.includes('departments.read')) throw new DepartmentReadError('FORBIDDEN');
  const includeEmail = actor.capabilities.includes('users.directory.read');
  const includeInactive = Boolean(options?.includeInactive && actor.capabilities.includes('departments.manage'));
  const visibleDepartmentIds = canListAllDepartments(actor)
    ? undefined
    : actor.departmentId ? [actor.departmentId] : [];
  const departmentWhere = {
    ...(visibleDepartmentIds ? { id: { in: visibleDepartmentIds } } : {}),
    ...(!includeInactive ? { isActive: true } : {}),
  };
  const [departments, publishedCounts] = await Promise.all([
    database.department.findMany({
      where: departmentWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        color: true,
        location: true,
        description: true,
        isActive: true,
        deactivatedAt: true,
        _count: { select: { documents: true, users: { where: { isActive: true } } } },
        users: {
          where: { role: Role.HOD, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true, role: true },
          take: 1,
        },
      },
    }),
    database.document.groupBy({
      by: ['departmentId'],
      where: {
        status: 'PUBLISHED',
        ...(visibleDepartmentIds ? { departmentId: { in: visibleDepartmentIds } } : {}),
        ...(!includeInactive ? { department: { isActive: true } } : {}),
      },
      _count: true,
    }),
  ]);
  const activeMap = new Map(publishedCounts.map((item) => [item.departmentId, item._count]));
  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    color: department.color,
    location: department.location,
    description: department.description,
    isActive: department.isActive,
    deactivatedAt: department.deactivatedAt,
    canOpen: canReadDetail(actor, department.id),
    _count: department._count,
    head: department.users[0] ? personDto(department.users[0], includeEmail) : null,
    sopStats: {
      active: activeMap.get(department.id) ?? 0,
      total: department._count.documents,
    },
  }));
}

export async function searchDepartments(
  database: OrganizationDatabase,
  actor: AuthUser,
  query: string,
  options?: { departmentId?: string },
) {
  if (!actor.capabilities.includes('departments.read')) return [];
  const scopedDepartmentId = canListAllDepartments(actor) ? options?.departmentId : actor.departmentId;
  if (!canListAllDepartments(actor) && !scopedDepartmentId) return [];
  return database.department.findMany({
    where: {
      ...(scopedDepartmentId ? { id: scopedDepartmentId } : {}),
      isActive: true,
      OR: [{ name: { contains: query, mode: 'insensitive' } }, { code: { contains: query, mode: 'insensitive' } }],
    },
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      location: true,
      description: true,
      isActive: true,
      deactivatedAt: true,
      _count: { select: { users: { where: { isActive: true } }, documents: true } },
    },
    orderBy: { name: 'asc' },
    take: 10,
  });
}

export async function readDepartment(database: OrganizationDatabase, actor: AuthUser, departmentId: string) {
  if (!actor.capabilities.includes('departments.read')) throw new DepartmentReadError('FORBIDDEN');
  if (!canReadDetail(actor, departmentId)) throw new DepartmentReadError('NOT_FOUND');
  const includeEmail = actor.capabilities.includes('users.directory.read');
  const department = await database.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      location: true,
      description: true,
      isActive: true,
      deactivatedAt: true,
      _count: { select: { documents: true, users: { where: { isActive: true } } } },
      users: {
        where: { isActive: true },
        orderBy: [{ role: 'desc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, jobTitle: true, role: true, email: true },
      },
      documents: {
        take: 20,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          code: true,
          version: true,
          description: true,
          status: true,
          category: true,
          priority: true,
          departmentId: true,
          authorId: true,
          nextReviewDate: true,
          effectiveDate: true,
          isLocked: true,
          pageCount: true,
          createdAt: true,
          updatedAt: true,
          department: { select: { id: true, name: true, code: true, color: true } },
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!department) throw new DepartmentReadError('NOT_FOUND');

  const [workflowList, templateList, templateCount, reviewCount] = await Promise.all([
    database.workflowRoute.findMany({ orderBy: { name: 'asc' } }),
    database.template.findMany({
      where: { OR: [{ departmentId }, { departmentId: null }] },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, description: true, category: true, version: true, status: true, departmentId: true, updatedAt: true },
    }),
    database.template.count({ where: { departmentId } }),
    database.document.count({
      where: { departmentId, status: { in: ['IN_REVIEW', 'SIGNED_HOD', 'SIGNED_FINANCE', 'SIGNED_GM'] } },
    }),
  ]);
  const users = department.users.map((user) => personDto(user, includeEmail));
  const head = department.users.find((user) => user.role === Role.HOD);
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    color: department.color,
    location: department.location,
    description: department.description,
    isActive: department.isActive,
    deactivatedAt: department.deactivatedAt,
    _count: department._count,
    users,
    documents: department.documents,
    head: head ? personDto(head, includeEmail) : null,
    stats: { workflows: workflowList.length, templates: templateCount, underReview: reviewCount },
    workflowList: workflowList.map(formatWorkflow),
    templateList,
  };
}
