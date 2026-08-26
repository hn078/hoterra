import { Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export class WorkforceOutboxReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
    this.name = 'WorkforceOutboxReadError';
  }
}

/** Delivery diagnostics only: email bodies may contain vendor bearer links and are never selected. */
export async function listWorkforceEmailOutbox(
  database: WorkforceDatabase,
  actor: AuthUser,
  limit = 100,
) {
  if (actor.role !== Role.SYSTEM_ADMINISTRATOR) throw new WorkforceOutboxReadError('FORBIDDEN');
  const take = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 100)));
  return database.emailOutbox.findMany({
    select: {
      id: true,
      toEmail: true,
      subject: true,
      entityType: true,
      entityId: true,
      status: true,
      attempts: true,
      lastError: true,
      nextAttemptAt: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
