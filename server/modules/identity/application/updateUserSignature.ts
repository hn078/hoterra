import { AuditAction } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type IdentityDatabase = typeof DatabaseModule.prisma;

export class UserSignatureError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_FORMAT') {
    super(code);
    this.name = 'UserSignatureError';
  }
}

export interface SignatureStorage {
  save(fileName: string, data: string, fileType: string): { filePath: string };
  remove(filePath: string): void;
}

export async function updateUserSignature(
  database: IdentityDatabase,
  actor: AuthUser,
  userId: string,
  input: { fileName?: unknown; data?: unknown },
  storage: SignatureStorage,
) {
  // A reusable signature is personal signing evidence, not account metadata.
  // Administrators may manage accounts but must never impersonate the signer.
  if (actor.id !== userId) throw new UserSignatureError('FORBIDDEN');
  const fileName = String(input.fileName ?? '').trim();
  const data = String(input.data ?? '');
  if (!fileName || !data) throw new UserSignatureError('INVALID_INPUT');
  const extension = /\.[^.]+$/.exec(fileName)?.[0].toLowerCase() || '.png';
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new UserSignatureError('INVALID_FORMAT');

  const initialTarget = await database.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!initialTarget) throw new UserSignatureError('NOT_FOUND');

  const saved = storage.save(fileName, data, extension.slice(1));
  let oldFilePath: string | null = null;
  try {
    const user = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity:user:${userId}`}))`;
      const target = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true, signatureImage: true },
      });
      if (!target) throw new UserSignatureError('NOT_FOUND');
      oldFilePath = target.signatureImage;
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { signatureImage: saved.filePath },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          department: { select: { id: true, name: true, code: true, color: true, isActive: true, deactivatedAt: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: userId,
          details: 'Updated own signature image',
        },
      });
      return updated;
    });
    if (oldFilePath && oldFilePath !== saved.filePath) {
      try { storage.remove(oldFilePath); } catch { /* database already points to the new file */ }
    }
    return { ...user, hasSignature: true };
  } catch (error) {
    try { storage.remove(saved.filePath); } catch { /* preserve original error */ }
    throw error;
  }
}
