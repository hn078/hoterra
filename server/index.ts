import './loadEnv';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import authRoutes from './routes/auth';
import departmentRoutes from './routes/departments';
import documentRoutes from './routes/documents';
import templateRoutes from './routes/templates';
import settingsRoutes from './routes/settings';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';
import workflowRoutes from './routes/workflows';
import searchRoutes from './routes/search';
import reportRoutes from './routes/reports';
import roleRoutes from './routes/roles';
import favoritesRoutes from './routes/favorites';
import conversationRoutes from './routes/conversations';
import workforceRoutes from './routes/workforce';
import vendorPortalRoutes from './routes/vendorPortal';
import fileRoutes from './routes/files';
import publicTenantRoutes from './routes/publicTenant';
import { startRecurringScheduler } from './lib/workforceRecurring';
import { tenantMiddleware } from './middleware/tenant';
import { isAllowedOrigin, isProduction, runtimeConfig, validateRuntimeConfig } from './config';
import { createRateLimiter, securityHeaders } from './middleware/security';
import { disconnectPrisma, systemPrisma } from './db';
import { assertDatabaseSecurity } from './databaseSecurity';
import { startEmailOutboxWorker, stopEmailOutboxWorker } from './lib/mail';

const FRONTEND_URL = runtimeConfig.frontendUrl;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProduction) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use((req, res, next) => {
    const requestId = String(req.headers['x-request-id'] || randomUUID()).slice(0, 100);
    const startedAt = Date.now();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      console.log(JSON.stringify({
        level: 'info',
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Slug'],
    exposedHeaders: ['X-Request-Id'],
    optionsSuccessStatus: 204,
    maxAge: 86_400,
  }));
  app.use('/api', createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: runtimeConfig.globalRateLimitMax,
  }));
  app.use(express.json({ limit: runtimeConfig.requestBodyLimit, strict: true }));

  app.get('/', (_req, res) => {
    res.redirect(FRONTEND_URL);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.7' });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      await systemPrisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/public', publicTenantRoutes);

  app.use('/api', tenantMiddleware);

  app.get('/api/tenant/current', (req, res) => {
    res.json({
      id: req.tenant!.id,
      slug: req.tenant!.slug,
      name: req.tenant!.name,
      url: `https://${req.tenant!.slug}.${process.env.TENANT_BASE_DOMAIN || 'hoterra.net'}`,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/favorites', favoritesRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/workforce', workforceRoutes);
  app.use('/api/vendor', vendorPortalRoutes);
  app.use('/api/files', fileRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api]', err);
    if (!res.headersSent) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'A record with the same unique value already exists' });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
      }
      if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
      if (err instanceof Error && err.message === 'Origin is not allowed by CORS') {
        return res.status(403).json({ error: 'Origin is not allowed' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}

export async function startServer(port = Number(process.env.PORT) || 3211) {
  validateRuntimeConfig();
  await assertDatabaseSecurity();
  const app = createApp();
  const host = process.env.HOST || '0.0.0.0';

  return new Promise<{ port: number }>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`HOTERRA HDMS API listening on ${host}:${port}`);
      startRecurringScheduler();
      startEmailOutboxWorker();
      resolve({ port });
    });

    const shutdown = (signal: string) => {
      console.log(`[server] ${signal} received; shutting down`);
      server.close(async () => {
        stopEmailOutboxWorker();
        await disconnectPrisma().catch(() => undefined);
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));

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
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  startServer().catch((error) => {
    console.error('[startup]', error);
    process.exit(1);
  });
}
