import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ensureDir, getUploadsDir } from './paths';
import { requireTenantContext } from './tenantContext';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_BRANDING_IMAGE_BYTES = 5 * 1024 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_UPLOAD_NAME_LENGTH = 180;
const OOXML_CONTENT_TYPES = Buffer.from('[Content_Types].xml');
const COMPOUND_FILE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
});
const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_BY_EXTENSION));

export class UploadTooLargeError extends Error {
  constructor() {
    super('File exceeds maximum size of 10 MB');
    this.name = 'UploadTooLargeError';
  }
}

export class InvalidUploadError extends Error {
  constructor(message = 'Unsupported or invalid file') {
    super(message);
    this.name = 'InvalidUploadError';
  }
}

export interface SavedUpload {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
}

const BRANDING_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function detectedImageType(buffer: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp';
  return null;
}

function isZipContainer(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  return (buffer[2] === 0x03 && buffer[3] === 0x04)
    || (buffer[2] === 0x05 && buffer[3] === 0x06)
    || (buffer[2] === 0x07 && buffer[3] === 0x08);
}

function isUtf8Text(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function contentMatchesExtension(buffer: Buffer, extension: string) {
  if (extension === '.png') return detectedImageType(buffer) === 'png';
  if (extension === '.jpg' || extension === '.jpeg') return detectedImageType(buffer) === 'jpeg';
  if (extension === '.webp') return detectedImageType(buffer) === 'webp';
  if (extension === '.pdf') return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
  if (extension === '.doc' || extension === '.xls') return buffer.subarray(0, 8).equals(COMPOUND_FILE_MAGIC);
  if (extension === '.docx') {
    return isZipContainer(buffer) && buffer.includes(OOXML_CONTENT_TYPES) && buffer.includes(Buffer.from('word/'));
  }
  if (extension === '.xlsx') {
    return isZipContainer(buffer) && buffer.includes(OOXML_CONTENT_TYPES) && buffer.includes(Buffer.from('xl/'));
  }
  if (extension === '.txt' || extension === '.csv') return isUtf8Text(buffer);
  return false;
}

function safeUploadName(originalFileName: string) {
  const baseName = path.basename(String(originalFileName).replace(/\\/g, '/'))
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
  if (!baseName || baseName === '.' || baseName === '..') {
    throw new InvalidUploadError('File name is invalid');
  }
  const extension = path.extname(baseName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new InvalidUploadError(`Unsupported file extension: ${extension || '(none)'}`);
  }
  const stem = baseName.slice(0, -extension.length).trim();
  if (!stem) throw new InvalidUploadError('File name is invalid');
  const maxStemLength = MAX_UPLOAD_NAME_LENGTH - extension.length;
  return `${stem.slice(0, maxStemLength)}${extension}`;
}

export function inspectBase64Upload(originalFileName: string, base64Data: string) {
  const normalizedBase64 = String(base64Data).replace(/\s/g, '');
  if (!normalizedBase64 || !BASE64_PATTERN.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
    throw new InvalidUploadError('File payload is not valid base64');
  }
  const estimatedBytes = Math.floor((normalizedBase64.length * 3) / 4);
  if (estimatedBytes > MAX_UPLOAD_BYTES + 2) throw new UploadTooLargeError();

  const fileName = safeUploadName(originalFileName);
  const extension = path.extname(fileName).toLowerCase();
  const buffer = Buffer.from(normalizedBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new UploadTooLargeError();
  if (!contentMatchesExtension(buffer, extension)) {
    throw new InvalidUploadError('File content does not match its file extension');
  }
  return { buffer, extension, fileName, fileType: MIME_BY_EXTENSION[extension] };
}

export function saveBase64ImageUpload(
  originalFileName: string,
  base64Data: string,
  subdir = 'branding'
): SavedUpload {
  const ext = path.extname(String(originalFileName)).toLowerCase();
  if (!BRANDING_IMAGE_EXTENSIONS.has(ext)) {
    throw new InvalidUploadError('Branding images must be PNG, JPEG, or WebP');
  }

  const normalizedBase64 = String(base64Data).replace(/\s/g, '');
  if (!normalizedBase64 || !BASE64_PATTERN.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
    throw new InvalidUploadError('Image payload is not valid base64');
  }
  const buffer = Buffer.from(normalizedBase64, 'base64');
  if (buffer.length > MAX_BRANDING_IMAGE_BYTES) {
    throw new InvalidUploadError('Branding image exceeds maximum size of 5 MB');
  }
  const detected = detectedImageType(buffer);
  const expected = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg';
  if (!detected || detected !== expected) {
    throw new InvalidUploadError('Image content does not match its file extension');
  }

  return saveBase64Upload(originalFileName, normalizedBase64, undefined, subdir);
}

export function saveBase64Upload(
  originalFileName: string,
  base64Data: string,
  _fileType?: string,
  subdir = 'messages'
): SavedUpload {
  const { buffer, extension, fileName, fileType } = inspectBase64Upload(originalFileName, base64Data);

  const uploadsDir = getUploadsDir();
  const tenant = requireTenantContext();
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9_-]/g, '');
  const targetDir = path.join(uploadsDir, tenant.id, safeSubdir);
  ensureDir(targetDir);

  const storedName = `${uuidv4()}${extension}`;
  const absolutePath = path.join(targetDir, storedName);
  fs.writeFileSync(absolutePath, buffer);

  return {
    fileName,
    filePath: `/uploads/${tenant.id}/${safeSubdir}/${storedName}`,
    fileSize: buffer.length,
    fileType,
  };
}

export function resolveUploadPath(relativePath: string): string {
  if (!relativePath.startsWith('/uploads/')) throw new InvalidUploadError('Invalid upload path');
  const root = path.resolve(getUploadsDir());
  const rel = relativePath.slice('/uploads/'.length);
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new InvalidUploadError('Upload path escapes the storage root');
  }
  return resolved;
}

/**
 * Resolves a private upload only when its storage key belongs to the active
 * tenant. RLS protects the database row; this is the second boundary that
 * prevents a corrupted or manually altered row from serving another hotel's
 * file.
 */
export function resolveTenantUploadPath(relativePath: string): string {
  const tenant = requireTenantContext();
  const expectedPrefix = `/uploads/${tenant.id}/`;
  if (!relativePath.startsWith(expectedPrefix)) {
    throw new InvalidUploadError('Upload does not belong to the active tenant');
  }
  return resolveUploadPath(relativePath);
}

export function deleteTenantUpload(relativePath: string | null | undefined, subdir: string): void {
  if (!relativePath) return;
  const tenant = requireTenantContext();
  const absolutePath = resolveUploadPath(relativePath);
  const expectedDir = path.resolve(getUploadsDir(), tenant.id, subdir);
  if (!absolutePath.startsWith(`${expectedDir}${path.sep}`)) {
    throw new InvalidUploadError('Upload does not belong to the expected tenant directory');
  }
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    fs.unlinkSync(absolutePath);
  }
}
