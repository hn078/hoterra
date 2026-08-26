import type * as DatabaseModule from '../../../db';
import { vendorInviteTokenCandidates } from '../domain/vendorInviteToken';

type WorkforceDatabase = typeof DatabaseModule.prisma;
export type VendorPortalReadErrorCode = 'NOT_FOUND' | 'EXPIRED';

export class VendorPortalReadError extends Error {
  constructor(public readonly code: VendorPortalReadErrorCode) {
    super(code);
    this.name = 'VendorPortalReadError';
  }
}

/** Token-authenticated, public and deliberately minimal vendor order DTO. */
export async function getVendorPortalOrder(
  database: WorkforceDatabase,
  rawToken: string,
  now = new Date(),
) {
  const candidates = vendorInviteTokenCandidates(rawToken);
  if (!candidates.length) throw new VendorPortalReadError('NOT_FOUND');
  const invite = await database.vendorInvite.findFirst({
    where: { token: { in: candidates } },
    select: {
      status: true,
      expiresAt: true,
      vendorId: true,
      vendor: { select: { id: true, name: true } },
      request: {
        select: {
          code: true,
          hotelName: true,
          workDate: true,
          endDate: true,
          comment: true,
          status: true,
          quantity: true,
          rateUnit: true,
          unitRate: true,
          rateCurrency: true,
          estimatedCost: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
          items: {
            select: {
              id: true,
              vendorId: true,
              rateUnit: true,
              quantity: true,
              hours: true,
              unitRate: true,
              rateCurrency: true,
              estimatedCost: true,
              position: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });
  if (!invite) throw new VendorPortalReadError('NOT_FOUND');
  if (invite.expiresAt.getTime() < now.getTime()) throw new VendorPortalReadError('EXPIRED');

  const assignedItems = invite.request.items.filter((item) => item.vendorId === invite.vendorId);
  const items = assignedItems.length
    ? assignedItems.map((item) => ({
        id: item.id,
        position: item.position.name,
        unit: item.rateUnit,
        quantity: item.quantity,
        hours: item.hours,
        unitRate: item.unitRate,
        currency: item.rateCurrency ?? 'AZN',
        estimatedCost: item.estimatedCost,
      }))
    : [{
        id: 'legacy',
        position: invite.request.position.name,
        unit: invite.request.rateUnit,
        quantity: invite.request.quantity,
        hours: null,
        unitRate: invite.request.unitRate,
        currency: invite.request.rateCurrency ?? 'AZN',
        estimatedCost: invite.request.estimatedCost,
      }];

  return {
    inviteStatus: invite.status,
    expiresAt: invite.expiresAt,
    canRespond: invite.status === 'PENDING' && invite.request.status === 'SENT_TO_VENDOR',
    vendor: invite.vendor,
    order: {
      code: invite.request.code,
      hotelName: invite.request.hotelName,
      department: invite.request.department.name,
      startDate: invite.request.workDate,
      endDate: invite.request.endDate,
      comment: invite.request.comment,
      status: invite.request.status,
      items,
    },
  };
}
