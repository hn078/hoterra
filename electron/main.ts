import { app, BrowserWindow, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { patchPrismaModuleResolution } from './prisma-setup';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    const logDir = app.getPath('userData');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'hoterra.log'), `${line}\n`);
  } catch {
    /* ignore logging errors */
  }
}

function showFatalError(title: string, message: string) {
  log(`FATAL: ${title} — ${message}`);
  dialog.showErrorBox(title, `${message}\n\nLog: ${path.join(app.getPath('userData'), 'hoterra.log')}`);
}

function toFileUrl(filePath: string): string {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

function getResourcePath(...segments: string[]) {
  if (isDev) {
    return path.join(__dirname, '..', ...segments);
  }
  return path.join(process.resourcesPath, ...segments);
}

function setupPrisma() {
  patchPrismaModuleResolution(isDev, process.resourcesPath, path.join(__dirname, '..'), log);
}

// A correctly seeded SQLite database is well above this size; an empty or
// partially-created database (from earlier broken builds) is far smaller.
const MIN_VALID_DB_SIZE = 16384;

function prepareDatabase() {
  const userData = app.getPath('userData');
  const dbFile = path.join(userData, 'hoterra.db');
  const markerFile = path.join(userData, 'db.initialized');

  fs.mkdirSync(userData, { recursive: true });

  const templateDb = getResourcePath('database', 'hoterra-template.db');
  const templateExists = fs.existsSync(templateDb);
  log(`Template DB: ${templateDb} (exists: ${templateExists})`);

  const dbExists = fs.existsSync(dbFile);
  const dbSize = dbExists ? fs.statSync(dbFile).size : 0;

  if (templateExists) {
    // (Re)initialize when the local DB is missing or looks empty/broken.
    // This self-heals installs that were created by earlier versions where
    // the template was never bundled, leaving an empty database.
    if (!dbExists || dbSize < MIN_VALID_DB_SIZE) {
      fs.copyFileSync(templateDb, dbFile);
      fs.writeFileSync(markerFile, String(fs.statSync(templateDb).size));
      log(`Initialized database from template (dbExisted=${dbExists}, dbSize=${dbSize})`);
    } else {
      log(`Existing database OK (size=${dbSize})`);
    }
  } else if (!dbExists) {
    log('ERROR: no template DB bundled and no existing database present');
  }

  const uploadsDir = path.join(userData, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  process.env.DATABASE_URL = toFileUrl(dbFile);
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'hoterra-hdms-production-secret';
  process.env.PORT = process.env.PORT || '3001';
  process.env.HOTERRA_UPLOADS_DIR = uploadsDir;
  log(`Database: ${process.env.DATABASE_URL}`);
  log(`Uploads: ${uploadsDir}`);

  return dbFile;
}

async function waitForApi(port: number, attempts = 60): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Health check HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1500, () => {
          req.destroy();
          reject(new Error('Health check timeout'));
        });
      });
      return port;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`API server did not respond on port ${port}`);
}

async function startBackend(): Promise<number> {
  if (isDev) {
    return waitForApi(3001);
  }

  prepareDatabase();
  setupPrisma();

  const serverPath = path.join(__dirname, '../dist-server/index.js');
  log(`Loading server module: ${serverPath}`);

  // DATABASE_URL and Prisma paths must be set before Prisma client initializes
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serverModule = require(serverPath);
  const { port } = await serverModule.startServer(Number(process.env.PORT) || 3001);
  log(`Server listening on ${port}`);
  return port;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'HOTERRA Document Management System',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    log(`Window failed to load: ${code} ${description}`);
    showFatalError('HOTERRA HDMS', `Failed to load UI: ${description}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    log(`Starting HOTERRA HDMS v${app.getVersion()} (packaged: ${app.isPackaged})`);
    try {
      await startBackend();
      createWindow();
    } catch (err) {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      showFatalError('HOTERRA HDMS — ошибка запуска', message);
      app.quit();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startBackend()
      .then(createWindow)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        showFatalError('HOTERRA HDMS — ошибка запуска', message);
      });
  }
});
