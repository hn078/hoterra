import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ensureDir, getUploadsDir } from './paths';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class UploadTooLargeError extends Error {
  constructor() {
    super('File exceeds maximum size of 10 MB');
    this.name = 'UploadTooLargeError';
  }
}

export interface SavedUpload {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
}

export function saveBase64Upload(
  originalFileName: string,
  base64Data: string,
  fileType?: string,
  subdir = 'messages'
): SavedUpload {
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadTooLargeError();
  }

  const uploadsDir = getUploadsDir();
  const targetDir = path.join(uploadsDir, subdir);
  ensureDir(targetDir);

  const ext = path.extname(originalFileName) || '.bin';
  const storedName = `${uuidv4()}${ext}`;
  const absolutePath = path.join(targetDir, storedName);
  fs.writeFileSync(absolutePath, buffer);

  return {
    fileName: originalFileName,
    filePath: `/uploads/${subdir}/${storedName}`,
    fileSize: buffer.length,
    fileType: fileType || ext.replace('.', ''),
  };
}

export function resolveUploadPath(relativePath: string): string {
  const rel = relativePath.replace(/^\/uploads\//, '');
  return path.join(getUploadsDir(), rel);
}
