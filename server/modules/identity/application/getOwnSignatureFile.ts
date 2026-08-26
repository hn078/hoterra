import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type IdentityDatabase = typeof DatabaseModule.prisma;

export class OwnSignatureFileError extends Error {
  constructor() {
    super('NOT_FOUND');
    this.name = 'OwnSignatureFileError';
  }
}

/** A reusable signature is credential-like and is readable only by its owner. */
export async function getOwnSignatureFile(
  database: IdentityDatabase,
  actor: AuthUser,
  requestedUserId: string,
) {
  if (requestedUserId !== actor.id) throw new OwnSignatureFileError();
  const user = await database.user.findFirst({
    where: { id: actor.id, tenantId: actor.tenantId, isActive: true },
    select: { signatureImage: true },
  });
  if (!user?.signatureImage) throw new OwnSignatureFileError();
  return { filePath: user.signatureImage, fileName: null, inline: true };
}
