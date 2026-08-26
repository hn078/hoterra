import { DocumentIndexSourceType, DocumentIndexStatus, DocumentStatus } from '@prisma/client';
import { prisma, systemPrisma } from '../../../db';
import { requireTenantContext, runWithTenant } from '../../../lib/tenantContext';
import { indexDocumentAttachmentFile, indexDocumentPrimaryFile } from '../application/indexDocumentFile';

const INDEX_BATCH_SIZE = 5;
const INDEX_INTERVAL_MS = 5 * 60 * 1000;
let timer: NodeJS.Timeout | undefined;
let running = false;
const runningTenants = new Set<string>();

async function indexTenantBatch() {
  const [missingPrimary, missingAttachments, pending] = await Promise.all([
    prisma.document.findMany({
      where: {
        filePath: { not: null },
        status: { not: DocumentStatus.DISPOSED },
        searchIndexes: { none: { sourceType: DocumentIndexSourceType.PRIMARY } },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: INDEX_BATCH_SIZE,
    }),
    prisma.documentAttachment.findMany({
      where: {
        document: { status: { not: DocumentStatus.DISPOSED } },
        searchIndex: { is: null },
      },
      select: { id: true, documentId: true },
      orderBy: { createdAt: 'asc' },
      take: INDEX_BATCH_SIZE,
    }),
    prisma.documentSearchIndex.findMany({
      where: { status: DocumentIndexStatus.PENDING },
      select: { documentId: true, attachmentId: true, sourceType: true },
      orderBy: { updatedAt: 'asc' },
      take: INDEX_BATCH_SIZE,
    }),
  ]);
  const jobs = [
    ...pending.map((index) => ({
      documentId: index.documentId,
      attachmentId: index.attachmentId,
      sourceType: index.sourceType,
    })),
    ...missingPrimary.map(({ id }) => ({
      documentId: id,
      attachmentId: null,
      sourceType: DocumentIndexSourceType.PRIMARY,
    })),
    ...missingAttachments.map(({ id, documentId }) => ({
      documentId,
      attachmentId: id,
      sourceType: DocumentIndexSourceType.ATTACHMENT,
    })),
  ].filter((job, index, all) => all.findIndex((candidate) =>
    candidate.sourceType === job.sourceType
    && candidate.documentId === job.documentId
    && candidate.attachmentId === job.attachmentId
  ) === index).slice(0, INDEX_BATCH_SIZE);

  for (const job of jobs) {
    if (job.sourceType === DocumentIndexSourceType.ATTACHMENT && job.attachmentId) {
      await indexDocumentAttachmentFile(prisma, job.documentId, job.attachmentId);
    } else {
      await indexDocumentPrimaryFile(prisma, job.documentId);
    }
  }
  return jobs.length;
}

export async function runCurrentTenantDocumentIndexingBatch() {
  const tenantId = requireTenantContext().id;
  if (runningTenants.has(tenantId)) return 0;
  runningTenants.add(tenantId);
  try {
    return await indexTenantBatch();
  } finally {
    runningTenants.delete(tenantId);
  }
}

export async function runDocumentIndexingBatch() {
  if (running) return 0;
  running = true;
  let indexed = 0;
  try {
    const tenants = await systemPrisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
    });
    for (const tenant of tenants) {
      try {
        indexed += await runWithTenant(tenant, runCurrentTenantDocumentIndexingBatch);
      } catch (error) {
        console.error('[document-index] tenant batch failed', {
          tenantSlug: tenant.slug,
          error: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
    return indexed;
  } finally {
    running = false;
  }
}

export function startDocumentIndexScheduler() {
  if (timer) return;
  const run = () => runDocumentIndexingBatch()
    .then((count) => { if (count) console.log(`[document-index] indexed ${count} file(s)`); })
    .catch((error) => console.error('[document-index]', error));
  setTimeout(run, 10_000).unref();
  timer = setInterval(run, INDEX_INTERVAL_MS);
  timer.unref();
  console.log('[document-index] scheduler started');
}

export function stopDocumentIndexScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
