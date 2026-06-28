import Module from 'module';
import path from 'path';
import fs from 'fs';

const ENGINE_NAMES = [
  'query_engine-windows.dll.node',
  'query_engine-windows.lib.node',
  'libquery_engine-darwin.dylib.node',
  'libquery_engine-linux-musl-openssl-3.0.x.so.node',
  'libquery_engine-linux-gnu.so.node',
];

export function getPrismaClientDir(isDev: boolean, resourcesPath: string, appRoot: string): string {
  const candidates = isDev
    ? [path.join(appRoot, 'node_modules', '.prisma', 'client')]
    : [
        path.join(resourcesPath, 'prisma', 'client'),
        path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client'),
        path.join(appRoot, 'node_modules', '.prisma', 'client'),
      ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'default.js'))) {
      return dir;
    }
  }

  return candidates[0];
}

export function patchPrismaModuleResolution(
  prismaClientDir: string,
  log: (message: string) => void
) {
  const defaultPath = path.join(prismaClientDir, 'default.js');
  const indexPath = path.join(prismaClientDir, 'index.js');

  if (!fs.existsSync(defaultPath)) {
    log(`Prisma client default.js missing at ${defaultPath}`);
    return;
  }

  const nodeModulesDir = path.dirname(path.dirname(prismaClientDir));
  const nodePathParts = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  const nodeModule = Module as typeof Module & {
    _initPaths: () => void;
    _resolveFilename: (
      request: string,
      parent: NodeModule | null | undefined,
      isMain: boolean,
      options?: unknown
    ) => string;
  };

  if (!nodePathParts.includes(nodeModulesDir)) {
    process.env.NODE_PATH = [nodeModulesDir, ...nodePathParts].join(path.delimiter);
    nodeModule._initPaths();
  }

  const originalResolve = nodeModule._resolveFilename.bind(nodeModule);
  nodeModule._resolveFilename = (request, parent, isMain, options) => {
    if (request === '.prisma/client/default' && fs.existsSync(defaultPath)) {
      return defaultPath;
    }
    if (request === '.prisma/client' && fs.existsSync(indexPath)) {
      return indexPath;
    }
    return originalResolve(request, parent, isMain, options);
  };

  for (const name of ENGINE_NAMES) {
    const enginePath = path.join(prismaClientDir, name);
    if (fs.existsSync(enginePath)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
      log(`Prisma engine: ${enginePath}`);
      break;
    }
  }

  log(`Prisma client: ${prismaClientDir}`);
}
