import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ensureDir, getUploadsDir } from './paths';
import { requireTenantContext } from './tenantContext';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_BRANDING_IMAGE_BYTES = 5 * 1024 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
  '.png', '.jpg', '.jpeg', '.webp',
]);

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

export function saveBase64ImageUpload(
  originalFileName: string,
  base64Data: string,
  subdir = 'branding'
): SavedUpload {
  const ext = path.extname(originalFileName).toLowerCase();
  if (!BRANDING_IMAGE_EXTENSIONS.has(ext)) {
    throw new InvalidUploadError('Branding images must be PNG, JPEG, or WebP');
  }

  const normalizedBase64 = base64Data.replace(/\s/g, '');
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

  return saveBase64Upload(originalFileName, normalizedBase64, `image/${detected}`, subdir);
}

export function saveBase64Upload(
  originalFileName: string,
  base64Data: string,
  fileType?: string,
  subdir = 'messages'
): SavedUpload {
  const normalizedBase64 = base64Data.replace(/\s/g, '');
  if (!normalizedBase64 || !BASE64_PATTERN.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
    throw new InvalidUploadError('File payload is not valid base64');
  }
  const estimatedBytes = Math.floor((normalizedBase64.length * 3) / 4);
  if (estimatedBytes > MAX_UPLOAD_BYTES + 2) throw new UploadTooLargeError();

  const ext = path.extname(originalFileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new InvalidUploadError(`Unsupported file extension: ${ext || '(none)'}`);
  }

  const buffer = Buffer.from(normalizedBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadTooLargeError();
  }

  const uploadsDir = getUploadsDir();
  const tenant = requireTenantContext();
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9_-]/g, '');
  const targetDir = path.join(uploadsDir, tenant.id, safeSubdir);
  ensureDir(targetDir);

  const storedName = `${uuidv4()}${ext}`;
  const absolutePath = path.join(targetDir, storedName);
  fs.writeFileSync(absolutePath, buffer);

  return {
    fileName: originalFileName,
    filePath: `/uploads/${tenant.id}/${safeSubdir}/${storedName}`,
    fileSize: buffer.length,
    fileType: fileType || ext.replace('.', ''),
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
