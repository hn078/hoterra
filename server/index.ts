import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import departmentRoutes from './routes/departments';
import documentRoutes from './routes/documents';
import templateRoutes from './routes/templates';
import settingsRoutes from './routes/settings';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export function createApp() {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  app.get('/', (_req, res) => {
    res.redirect(FRONTEND_URL);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', frontend: FRONTEND_URL });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);

  return app;
}

export function startServer(port = Number(process.env.PORT) || 3001) {
  const app = createApp();

  return new Promise<{ port: number }>((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`HOTERRA HDMS API:  http://127.0.0.1:${port}/api`);
      resolve({ port });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port < 3010) {
        startServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

if (require.main === module) {
  startServer();
}
