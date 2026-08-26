import { Role, WorkforceRequestStatus, WorkforceVendorMode } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { respondToVendorInvite, type VendorInviteResponseAction } from './respondToVendorInvite';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type SimulateVendorResponseErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'VENDOR_REQUIRED'
  | 'INVALID_VENDOR'
  | 'NO_INVITE'
  | 'RESPONSE_FAILED';

export class SimulateVendorResponseError extends Error {
  constructor(
    public readonly code: SimulateVendorResponseErrorCode,
    public readonly detail?: string,
    public readonly httpStatus?: number,
  ) {
    super(code);
    this.name = 'SimulateVendorResponseError';
  }
}

function parseBroadcastVendorIds(value: string | null) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Development-only adapter; the HTTP route must additionally enforce the runtime feature flag. */
export async function simulateVendorResponse(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  action: VendorInviteResponseAction,
  input: { vendorId?: unknown; reason?: unknown },
) {
  if (actor.role !== Role.SYSTEM_ADMINISTRATOR) throw new SimulateVendorResponseError('FORBIDDEN');
  const request = await database.workforceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, vendorId: true, vendorMode: true, broadcastVendorIds: true },
  });
  if (!request) throw new SimulateVendorResponseError('NOT_FOUND');
  if (request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) {
    throw new SimulateVendorResponseError('INVALID_STATE');
  }

  const suppliedVendorId = String(input.vendorId || '').trim();
  let vendorId = suppliedVendorId || request.vendorId || '';
  if (action === 'accept' && request.vendorMode === WorkforceVendorMode.BROADCAST) {
    if (!suppliedVendorId) throw new SimulateVendorResponseError('VENDOR_REQUIRED');
    const allowed = parseBroadcastVendorIds(request.broadcastVendorIds);
    if (!allowed.includes(suppliedVendorId)) throw new SimulateVendorResponseError('INVALID_VENDOR');
    vendorId = suppliedVendorId;
  }
  if (action === 'accept' && !vendorId) throw new SimulateVendorResponseError('VENDOR_REQUIRED');

  const invite = await database.vendorInvite.findFirst({
    where: { requestId, ...(vendorId ? { vendorId } : {}), status: 'PENDING' },
    select: { token: true },
  });
  if (!invite) throw new SimulateVendorResponseError('NO_INVITE');

  const result = await respondToVendorInvite(
    database,
    invite.token,
    action,
    String(input.reason || ''),
    actor,
  );
  if ('error' in result) {
    throw new SimulateVendorResponseError('RESPONSE_FAILED', result.error, result.httpStatus);
  }
  return result;
}
