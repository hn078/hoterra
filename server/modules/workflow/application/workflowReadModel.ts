import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { formatWorkflow } from '../domain/workflowDefinition';

type WorkflowDatabase = typeof DatabaseModule.prisma;

export class WorkflowReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
    this.name = 'WorkflowReadError';
  }
}

const workflowSelect = {
  id: true,
  name: true,
  description: true,
  steps: true,
  isDefault: true,
  status: true,
  createdAt: true,
} as const;

export async function listWorkflows(database: WorkflowDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('workflows.read')) throw new WorkflowReadError('FORBIDDEN');
  const workflows = await database.workflowRoute.findMany({
    select: workflowSelect,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return workflows.map(formatWorkflow);
}

export async function readWorkflow(database: WorkflowDatabase, actor: AuthUser, workflowId: string) {
  if (!actor.capabilities.includes('workflows.read')) throw new WorkflowReadError('FORBIDDEN');
  const workflow = await database.workflowRoute.findUnique({ where: { id: workflowId }, select: workflowSelect });
  if (!workflow) throw new WorkflowReadError('NOT_FOUND');
  return formatWorkflow(workflow);
}

export async function searchWorkflows(
  database: WorkflowDatabase,
  actor: AuthUser,
  query: string,
  options?: { includeArchived?: boolean; dateFrom?: Date; sort?: 'relevance' | 'date' | 'name' },
) {
  if (!actor.capabilities.includes('workflows.read')) return [];
  const workflows = await database.workflowRoute.findMany({
    where: {
      ...(!options?.includeArchived ? { status: { not: 'ARCHIVED' as const } } : {}),
      ...(options?.dateFrom ? { createdAt: { gte: options.dateFrom } } : {}),
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: workflowSelect,
    orderBy: options?.sort === 'name'
      ? [{ name: 'asc' }]
      : [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    take: 10,
  });
  return workflows.map(formatWorkflow);
}
