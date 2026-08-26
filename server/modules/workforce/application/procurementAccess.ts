import { Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { Capability } from '../../access-control';

type WorkforceDatabase = typeof DatabaseModule.prisma;

/** Resolves Procurement Workforce Manager access from system and custom roles. */
export async function canManageProcurementWorkforce(
  database: WorkforceDatabase,
  actor: { id: string; role: Role; capabilities: readonly Capability[] },
): Promise<boolean> {
  const user = await database.user.findUnique({
    where: { id: actor.id },
    select: { isActive: true, department: { select: { code: true } } },
  });
  return Boolean(
    user?.isActive &&
    user.department?.code === 'PR' &&
    actor.capabilities.includes('workforce.read') &&
    actor.capabilities.includes('workforce.vendor.manage')
  );
}

export async function canConfirmProcurementSelection(
  database: WorkforceDatabase,
  actor: { id: string; role: Role; capabilities: readonly Capability[] },
): Promise<boolean> {
  const user = await database.user.findUnique({
    where: { id: actor.id },
    select: { isActive: true, department: { select: { code: true } } },
  });
  if (!user?.isActive || user.department?.code !== 'PR') return false;
  if (actor.role === Role.HOD) return actor.capabilities.includes('workforce.read');
  return canManageProcurementWorkforce(database, actor);
}
