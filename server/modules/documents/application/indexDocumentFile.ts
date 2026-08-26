import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { DocumentIndexSourceType, DocumentIndexStatus, DocumentStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import { resolveTenantUploadPath } from '../../../lib/uploads';

type DocumentDatabase = typeof DatabaseModule.prisma;

const MAX_INDEX_CHARACTERS = 1_000_000;
const MAX_PDF_PAGES = 250;
const MAX_WORKBOOK_CELLS = 100_000;

type ExtractionResult = {
  status: DocumentIndexStatus;
  text: string | null;
  errorCode: string | null;
};

function normalizedText(value: string) {
  return value
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_INDEX_CHARACTERS);
}

function completed(
  text: string,
  emptyStatus: DocumentIndexStatus = DocumentIndexStatus.EMPTY,
): ExtractionResult {
  const normalized = normalizedText(text);
  return normalized
    ? { status: DocumentIndexStatus.READY, text: normalized, errorCode: null }
    : { status: emptyStatus, text: null, errorCode: null };
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // pdfjs-dist is ESM-only while the backend build is CommonJS. Keeping the
  // native import here avoids loading the browser worker and works on Node 20+.
  const nativeImport = new Function('specifier', 'return import(specifier)') as
    (specifier: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;
  const pdfjs = await nativeImport('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      return { status: DocumentIndexStatus.FAILED, text: null, errorCode: 'PDF_PAGE_LIMIT' };
    }
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '));
      if (pages.reduce((total, value) => total + value.length, 0) >= MAX_INDEX_CHARACTERS) break;
    }
    return completed(pages.join('\n'), DocumentIndexStatus.OCR_REQUIRED);
  } finally {
    await loadingTask.destroy();
  }
}

async function extractWorkbook(buffer: Buffer): Promise<ExtractionResult> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  const values: string[] = [];
  let visitedCells = 0;
  workbook.eachSheet((sheet) => {
    if (visitedCells >= MAX_WORKBOOK_CELLS) return;
    values.push(sheet.name);
    sheet.eachRow((row) => {
      if (visitedCells >= MAX_WORKBOOK_CELLS) return;
      row.eachCell({ includeEmpty: false }, (cell) => {
        visitedCells += 1;
        if (visitedCells <= MAX_WORKBOOK_CELLS) values.push(cell.text);
      });
    });
  });
  return completed(values.join('\n'));
}

async function extractFile(filePath: string, fileName: string): Promise<ExtractionResult> {
  const extension = path.extname(fileName).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    return { status: DocumentIndexStatus.OCR_REQUIRED, text: null, errorCode: null };
  }
  if (['.doc', '.xls'].includes(extension)) {
    return { status: DocumentIndexStatus.UNSUPPORTED, text: null, errorCode: 'LEGACY_FORMAT' };
  }
  if (!['.txt', '.csv', '.pdf', '.docx', '.xlsx'].includes(extension)) {
    return { status: DocumentIndexStatus.UNSUPPORTED, text: null, errorCode: 'UNSUPPORTED_FORMAT' };
  }

  const buffer = await fs.readFile(resolveTenantUploadPath(filePath));
  if (extension === '.txt' || extension === '.csv') return completed(buffer.toString('utf8'));
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return completed(result.value);
  }
  if (extension === '.xlsx') return extractWorkbook(buffer);
  return extractPdf(buffer);
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error) {
    if (/password|encrypted/i.test(error.message)) return 'ENCRYPTED_FILE';
    if (/invalid|malformed|corrupt|format/i.test(error.message)) return 'INVALID_FILE';
  }
  return 'EXTRACTION_FAILED';
}

/**
 * Refreshes a document's private-file search index. Extraction is deliberately
 * outside the upload transaction: an unreadable file never rolls back a valid
 * upload. The conditional final update prevents an older extraction job from
 * overwriting a newer primary file.
 */
export async function indexDocumentPrimaryFile(
  database: DocumentDatabase,
  documentId: string,
) {
  const document = await database.document.findUnique({
    where: { id: documentId },
    select: { id: true, version: true, status: true, filePath: true, fileName: true },
  });
  if (!document || document.status === DocumentStatus.DISPOSED) return null;

  if (!document.filePath || !document.fileName) {
    return database.documentSearchIndex.upsert({
      where: { documentId_sourceKey: { documentId, sourceKey: 'PRIMARY' } },
      create: {
        documentId,
        sourceType: DocumentIndexSourceType.PRIMARY,
        sourceKey: 'PRIMARY',
        sourceVersion: document.version,
        status: DocumentIndexStatus.EMPTY,
        indexedAt: new Date(),
      },
      update: {
        attachmentId: null,
        sourceType: DocumentIndexSourceType.PRIMARY,
        sourcePath: null,
        sourceFileName: null,
        sourceVersion: document.version,
        status: DocumentIndexStatus.EMPTY,
        extractedText: null,
        errorCode: null,
        indexedAt: new Date(),
      },
    });
  }

  const sourcePath = document.filePath;
  const sourceFileName = document.fileName;
  const sourceVersion = document.version;
  return indexStoredFile(database, {
    documentId,
    attachmentId: null,
    sourceType: DocumentIndexSourceType.PRIMARY,
    sourceKey: 'PRIMARY',
    sourcePath,
    sourceFileName,
    sourceVersion,
  });
}

type StoredIndexSource = {
  documentId: string;
  attachmentId: string | null;
  sourceType: DocumentIndexSourceType;
  sourceKey: string;
  sourcePath: string;
  sourceFileName: string;
  sourceVersion: string;
};

async function indexStoredFile(database: DocumentDatabase, source: StoredIndexSource) {
  const {
    documentId,
    attachmentId,
    sourceType,
    sourceKey,
    sourcePath,
    sourceFileName,
    sourceVersion,
  } = source;
  await database.documentSearchIndex.upsert({
    where: { documentId_sourceKey: { documentId, sourceKey } },
    create: {
      documentId,
      attachmentId,
      sourceType,
      sourceKey,
      sourcePath,
      sourceFileName,
      sourceVersion,
      status: DocumentIndexStatus.PENDING,
    },
    update: {
      attachmentId,
      sourceType,
      sourcePath,
      sourceFileName,
      sourceVersion,
      status: DocumentIndexStatus.PENDING,
      extractedText: null,
      errorCode: null,
      indexedAt: null,
    },
  });

  let result: ExtractionResult;
  try {
    result = await extractFile(sourcePath, sourceFileName);
  } catch (error) {
    result = { status: DocumentIndexStatus.FAILED, text: null, errorCode: safeErrorCode(error) };
  }

  await database.documentSearchIndex.updateMany({
    where: { documentId, sourceKey, sourcePath, sourceFileName, sourceVersion, status: DocumentIndexStatus.PENDING },
    data: {
      status: result.status,
      extractedText: result.text,
      errorCode: result.errorCode,
      indexedAt: new Date(),
    },
  });
  return database.documentSearchIndex.findUnique({
    where: { documentId_sourceKey: { documentId, sourceKey } },
  });
}

export async function indexDocumentAttachmentFile(
  database: DocumentDatabase,
  documentId: string,
  attachmentId: string,
) {
  const attachment = await database.documentAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      documentId: true,
      filePath: true,
      fileName: true,
      createdAt: true,
      document: { select: { status: true } },
    },
  });
  if (!attachment || attachment.documentId !== documentId || attachment.document.status === DocumentStatus.DISPOSED) {
    return null;
  }
  return indexStoredFile(database, {
    documentId,
    attachmentId,
    sourceType: DocumentIndexSourceType.ATTACHMENT,
    sourceKey: attachment.id,
    sourcePath: attachment.filePath,
    sourceFileName: attachment.fileName,
    sourceVersion: attachment.createdAt.toISOString(),
  });
}
