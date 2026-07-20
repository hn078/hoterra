import { randomBytes } from 'crypto';
import { WorkforceRequestStatus, WorkforceVendorMode } from '@prisma/client';
import { prisma } from '../db';
import { appUrl, queueEmail } from './mail';
import { addEvent, loadRequest, parseVendorIds } from './workforce';

function newToken() {
  return randomBytes(24).toString('hex');
}

export async function dispatchToVendors(requestId: string) {
  const request = await loadRequest(requestId);
  if (!request || request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) return [];

  const vendorIds =
    request.vendorMode === WorkforceVendorMode.BROADCAST
      ? parseVendorIds(request.broadcastVendorIds)
      : request.vendorId
        ? [request.vendorId]
        : [];

  if (vendorIds.length === 0) return [];

  const vendors = await prisma.vendor.findMany({
    where: { id: { in: vendorIds }, isActive: true },
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invites = [];

  for (const vendor of vendors) {
    const existing = await prisma.vendorInvite.findFirst({
      where: { requestId, vendorId: vendor.id, status: 'PENDING' },
    });
    if (existing) {
      invites.push(existing);
      continue;
    }

    const invite = await prisma.vendorInvite.create({
      data: {
        token: newToken(),
        requestId,
        vendorId: vendor.id,
        expiresAt,
      },
    });
    invites.push(invite);

    const portalLink = appUrl(`/vendor/order/${invite.token}`);
    const to = vendor.contactEmail || `ops@${vendor.name.toLowerCase().replace(/\s+/g, '')}.az`;
    await queueEmail({
      toEmail: to,
      subject: `[HOTERRA] Casual staff order ${request.code}`,
      body: [
        `Hello ${vendor.name},`,
        '',
        `You have a new casual staff order from HOTERRA.`,
        `Code: ${request.code}`,
        `Hotel: ${request.hotelName}`,
        `Department: ${request.department.name}`,
        `Position: ${request.position.name}`,
        `Date: ${request.workDate.toISOString().slice(0, 10)}`,
        `Shift: ${request.shift}`,
        `Quantity: ${request.quantity}`,
        request.comment ? `Comment: ${request.comment}` : '',
        '',
        `Accept or decline here (no login required):`,
        portalLink,
        '',
        `Link expires: ${expiresAt.toISOString()}`,
      ]
        .filter(Boolean)
        .join('\n'),
      entityType: 'VendorInvite',
      entityId: invite.id,
    });
  }

  await addEvent(
    requestId,
    'SENT_TO_VENDOR',
    null,
    `Order emailed to ${invites.length} vendor(s) with portal links`
  );

  return invites;
}

export async function getInviteByToken(token: string) {
  return prisma.vendorInvite.findUnique({
    where: { token },
    include: {
      vendor: true,
      request: {
        include: {
          department: true,
          position: true,
        },
      },
    },
  });
}

export async function respondVendorInvite(
  token: string,
  action: 'accept' | 'decline',
  reason?: string
) {
  const invite = await getInviteByToken(token);
  if (!invite) return { error: 'Invite not found', httpStatus: 404 as const };
  if (invite.status !== 'PENDING') {
    return { error: `Invite already ${invite.status.toLowerCase()}`, httpStatus: 400 as const };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.vendorInvite.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    return { error: 'Invite expired', httpStatus: 400 as const };
  }
  if (invite.request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) {
    return { error: 'Order is no longer available', httpStatus: 400 as const };
  }

  if (action === 'decline') {
    await prisma.vendorInvite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await addEvent(
      invite.requestId,
      'VENDOR_DECLINED',
      null,
      `${invite.vendor.name} declined${reason ? `: ${reason}` : ''}`
    );

    const pending = await prisma.vendorInvite.count({
      where: { requestId: invite.requestId, status: 'PENDING' },
    });
    if (pending === 0) {
      await prisma.workforceRequest.update({
        where: { id: invite.requestId },
        data: { status: WorkforceRequestStatus.VENDOR_DECLINED },
      });
    }

    return { ok: true as const, status: 'DECLINED' as const };
  }

  // Accept — first wins for broadcast
  await prisma.$transaction(async (tx) => {
    await tx.vendorInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    await tx.vendorInvite.updateMany({
      where: {
        requestId: invite.requestId,
        id: { not: invite.id },
        status: 'PENDING',
      },
      data: { status: 'LOST', respondedAt: new Date() },
    });
    await tx.workforceRequest.update({
      where: { id: invite.requestId },
      data: {
        status: WorkforceRequestStatus.VENDOR_ACCEPTED,
        acceptedVendorId: invite.vendorId,
      },
    });
  });

  await addEvent(
    invite.requestId,
    'VENDOR_ACCEPTED',
    null,
    `${invite.vendor.name} accepted via vendor portal`
  );

  await prisma.notification.create({
    data: {
      userId: invite.request.createdById,
      title: 'Vendor accepted order',
      message: `${invite.vendor.name} accepted ${invite.request.code}`,
      type: 'workforce',
      link: `/workforce/${invite.requestId}`,
    },
  });

  return { ok: true as const, status: 'ACCEPTED' as const };
}
