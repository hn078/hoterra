import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuditAction, Prisma, type Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { serializeAuditState } from '../../audit';
import { expectedSignerRole, parseSignaturePlacements } from '../domain/signaturePolicy';
import { canActOnDocumentWorkflow } from '../domain/documentPolicy';

type DocumentDatabase = typeof DatabaseModule.prisma;
export type DocumentSigningErrorCode =
  | 'PIN_REQUIRED'
  | 'PIN_NOT_CONFIGURED'
  | 'INVALID_PIN'
  | 'SIGNATURE_IMAGE_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CONTENT_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'ALREADY_SIGNED';

export class DocumentSigningError extends Error {
  constructor(
    public readonly code: DocumentSigningErrorCode,
    public readonly expectedRole: Role | null = null,
  ) {
    super(code);
    this.name = 'DocumentSigningError';
  }
}

const POSITION_LABELS: Partial<Record<Role, string>> = {
  HOD: 'Head of Department',
  FINANCE_DIRECTOR: 'Finance Director',
  GENERAL_MANAGER: 'General Manager',
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Employee',
};

type DocumentEvidenceHasher = (storedPath: string) => Promise<string>;

async function evidenceHash(
  document: {
    id: string;
    code: string;
    version: string;
    approvalCycle: number;
    title: string;
    description: string | null;
    content: string | null;
    category: string;
    departmentId: string;
    effectiveDate: Date | null;
    filePath: string | null;
  },
  hashStoredFile?: DocumentEvidenceHasher,
) {
  let source: { fileSha256: string } | { content: string };
  if (document.filePath) {
    if (!hashStoredFile) throw new DocumentSigningError('CONTENT_UNAVAILABLE');
    try {
      source = { fileSha256: await hashStoredFile(document.filePath) };
    } catch {
      throw new DocumentSigningError('CONTENT_UNAVAILABLE');
    }
  } else {
    source = { content: document.content ?? '' };
  }
  const payload = JSON.stringify({
    documentId: document.id,
    code: document.code,
    version: document.version,
    approvalCycle: document.approvalCycle,
    title: document.title,
    description: document.description,
    category: document.category,
    departmentId: document.departmentId,
    effectiveDate: document.effectiveDate?.toISOString() ?? null,
    ...source,
  });
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

/** Verifies signer identity and atomically records one signature per workflow placement. */
export async function signDocument(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  input: { pin?: string; ipAddress?: string; device?: string; hashStoredFile?: DocumentEvidenceHasher },
) {
  if (!input.pin) throw new DocumentSigningError('PIN_REQUIRED');
  const user = await database.user.findUnique({ where: { id: actor.id } });
  if (!user?.pinHash) throw new DocumentSigningError('PIN_NOT_CONFIGURED');
  if (!await bcrypt.compare(String(input.pin), user.pinHash)) {
    throw new DocumentSigningError('INVALID_PIN');
  }
  if (!user.signatureImage) throw new DocumentSigningError('SIGNATURE_IMAGE_REQUIRED');

  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({
      where: { id: documentId },
      include: { signatures: true },
    });
    if (!current) throw new DocumentSigningError('NOT_FOUND');

    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Document" WHERE "id" = ${documentId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`
    );
    const locked = await transaction.document.findUnique({
      where: { id: documentId },
      include: { signatures: true },
    });
    if (!locked) throw new DocumentSigningError('NOT_FOUND');
    if (locked.status !== current.status) throw new DocumentSigningError('CONFLICT');

    const expectedRole = expectedSignerRole(locked.status);
    if (!canActOnDocumentWorkflow(actor, locked, expectedRole, 'documents.sign')) {
      throw new DocumentSigningError('FORBIDDEN', expectedRole);
    }

    const placements = parseSignaturePlacements(locked.signaturePlacement);
    const roleForPlacement = expectedRole ?? user.role;
    const placement = placements.find((item) => item.role === roleForPlacement);
    const alreadySigned = locked.signatures.some((signature) =>
      signature.documentVersion === locked.version &&
      signature.approvalCycle === locked.approvalCycle &&
      (placement ? signature.placementId === placement.id : signature.userId === actor.id)
    );
    if (alreadySigned) throw new DocumentSigningError('ALREADY_SIGNED');

    const actorName = `${user.firstName} ${user.lastName}`;
    const docHash = await evidenceHash(locked, input.hashStoredFile);
    const signature = await transaction.signature.create({
      data: {
        documentId,
        userId: actor.id,
        fullName: actorName,
        position: user.jobTitle || POSITION_LABELS[user.role] || user.role,
        ipAddress: input.ipAddress,
        device: input.device || 'Web',
        docHash,
        documentVersion: locked.version,
        approvalCycle: locked.approvalCycle,
        imagePath: user.signatureImage,
        placementId: placement?.id ?? null,
        page: placement?.page === 'all' ? null : (placement?.page ?? locked.pageCount),
      },
      select: {
        id: true,
        userId: true,
        fullName: true,
        position: true,
        signedAt: true,
        docHash: true,
        documentVersion: true,
        approvalCycle: true,
        placementId: true,
        page: true,
      },
    });
    await transaction.documentHistory.create({
      data: {
        documentId,
        action: `Signed by ${actorName}`,
        userId: actor.id,
        userName: actorName,
      },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: AuditAction.SIGN,
        entityType: 'Document',
        entityId: documentId,
        details: `Signed "${locked.title}"`,
        outcome: 'SUCCESS',
        reason: `Signer completed the ${String(expectedRole || user.role)} signature step`,
        beforeState: serializeAuditState({
          documentId,
          documentVersion: locked.version,
          approvalCycle: locked.approvalCycle,
          documentStatus: locked.status,
          currentCycleSignatureCount: locked.signatures.filter((item) =>
            item.documentVersion === locked.version && item.approvalCycle === locked.approvalCycle
          ).length,
        }),
        afterState: serializeAuditState({
          documentId,
          documentVersion: signature.documentVersion,
          approvalCycle: signature.approvalCycle,
          documentStatus: locked.status,
          signatureId: signature.id,
          signerUserId: signature.userId,
          signerPosition: signature.position,
          placementId: signature.placementId,
          page: signature.page,
          signedAt: signature.signedAt,
          signedDocumentDigest: signature.docHash,
          currentCycleSignatureCount: locked.signatures.filter((item) =>
            item.documentVersion === locked.version && item.approvalCycle === locked.approvalCycle
          ).length + 1,
        }),
      },
    });
    return { ...signature, hasImage: true };
  });
}
