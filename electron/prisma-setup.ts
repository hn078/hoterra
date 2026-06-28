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

type NodeModuleWithInternals = typeof Module & {
  _initPaths: () => void;
  _resolveFilename: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
    options?: unknown
  ) => string;
};

function resolveExisting(basePath: string, ...parts: string[]): string | null {
  const candidate = path.join(basePath, ...parts);
  if (fs.existsSync(candidate)) return candidate;
  if (fs.existsSync(`${candidate}.js`)) return `${candidate}.js`;
  if (fs.existsSync(path.join(candidate, 'index.js'))) return path.join(candidate, 'index.js');
  return null;
}

export function getUnpackedNodeModules(resourcesPath: string, appRoot: string): string {
  const candidates = [
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
    path.join(appRoot, 'node_modules'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, '.prisma', 'client', 'default.js'))) {
      return dir;
    }
  }

  return candidates[0];
}

export function patchPrismaModuleResolution(
  isDev: boolean,
  resourcesPath: string,
  appRoot: string,
  log: (message: string) => void
) {
  if (isDev) return;

  const nodeModulesDir = getUnpackedNodeModules(resourcesPath, appRoot);
  const prismaClientDir = path.join(nodeModulesDir, '.prisma', 'client');
  const prismaPackageDir = path.join(nodeModulesDir, '@prisma', 'client');
  const defaultPath = path.join(prismaClientDir, 'default.js');

  if (!fs.existsSync(defaultPath)) {
    throw new Error(`Prisma client missing at ${defaultPath}`);
  }

  const runtimeLibrary = resolveExisting(prismaPackageDir, 'runtime', 'library.js');
  if (!runtimeLibrary) {
    throw new Error(`Prisma runtime missing at ${path.join(prismaPackageDir, 'runtime', 'library.js')}`);
  }

  const nodeModule = Module as NodeModuleWithInternals;
  const nodePathParts = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);

  if (!nodePathParts.includes(nodeModulesDir)) {
    process.env.NODE_PATH = [nodeModulesDir, ...nodePathParts].join(path.delimiter);
    nodeModule._initPaths();
  }

  const originalResolve = nodeModule._resolveFilename.bind(nodeModule);
  nodeModule._resolveFilename = (request, parent, isMain, options) => {
    if (request === '.prisma/client/default') {
      return defaultPath;
    }

    if (request === '.prisma/client') {
      return path.join(prismaClientDir, 'index.js');
    }

    if (request === '@prisma/client/runtime/library.js' || request === '@prisma/client/runtime/library') {
      return runtimeLibrary;
    }

    if (request.startsWith('@prisma/client/')) {
      const subpath = request.slice('@prisma/client/'.length);
      const resolved = resolveExisting(prismaPackageDir, ...subpath.split('/'));
      if (resolved) return resolved;
    }

    if (request === '@prisma/client') {
      const resolved = resolveExisting(prismaPackageDir, 'default.js');
      if (resolved) return resolved;
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

  log(`Prisma node_modules: ${nodeModulesDir}`);
  log(`Prisma runtime: ${runtimeLibrary}`);
}
