import { app, BrowserWindow, shell } from 'electron';
import { fork, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

function getResourcePath(...segments: string[]) {
  if (isDev) {
    return path.join(__dirname, '..', ...segments);
  }
  return path.join(process.resourcesPath, ...segments);
}

function prepareDatabase() {
  const userData = app.getPath('userData');
  const dbFile = path.join(userData, 'hoterra.db');

  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
  }

  if (!fs.existsSync(dbFile)) {
    const templateDb = getResourcePath('database', 'hoterra-template.db');
    if (fs.existsSync(templateDb)) {
      fs.copyFileSync(templateDb, dbFile);
    }
  }

  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'hoterra-hdms-production-secret';
  process.env.PORT = process.env.PORT || '3001';

  return dbFile;
}

async function waitForApi(port: number, attempts = 40): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Health check failed: ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return port;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('API server failed to start');
}

async function startBackend(): Promise<number> {
  if (isDev) {
    return waitForApi(3001);
  }

  prepareDatabase();

  const serverEntry = path.join(__dirname, '../dist-server/index.js');
  serverProcess = fork(serverEntry, [], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`Server process exited with code ${code}`);
    }
  });

  return waitForApi(Number(process.env.PORT) || 3001);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'HOTERRA Document Management System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    console.error('Failed to start HOTERRA HDMS:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  serverProcess?.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startBackend().then(createWindow).catch(console.error);
  }
});
