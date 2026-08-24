import path from 'path';
import fs from 'fs';
import { isProduction } from '../config';

/**
 * Resolves the writable uploads directory.
 *
 * In a packaged Electron app, the server code runs from inside `app.asar`,
 * which is a read-only archive file (not a real directory). Writing there
 * throws ENOTDIR, so the Electron main process passes a writable location
 * (under userData) via HOTERRA_UPLOADS_DIR. In development we fall back to
 * an `uploads` folder at the project root.
 */
export function getUploadsDir(): string {
  const fromEnv = process.env.HOTERRA_UPLOADS_DIR;
  const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (isProduction && !fromEnv?.trim() && !volumeMount?.trim()) {
    throw new Error('Persistent upload storage is required: set HOTERRA_UPLOADS_DIR or mount a Railway volume');
  }
  const dir = fromEnv?.trim()
    ? fromEnv
    : volumeMount?.trim()
      ? path.join(volumeMount, 'uploads')
      : path.join(process.cwd(), 'uploads');

  ensureDir(dir);
  return dir;
}

export function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // Surface a clearer message than a raw ENOTDIR.
    throw new Error(
      `Cannot create uploads directory "${dir}": ${(err as Error).message}`
    );
  }
}
