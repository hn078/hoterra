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

function getPrismaBundlePaths(resourcesPath: string, appRoot: string) {
  const bundled = {
    clientDir: path.join(resourcesPath, 'prisma', 'generated-client'),
    packageDir: path.join(resourcesPath, 'prisma', 'npm-client'),
  };

  if (fs.existsSync(path.join(bundled.clientDir, 'default.js'))) {
    return bundled;
  }

  const fallbackNodeModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  return {
    clientDir: path.join(fallbackNodeModules, '.prisma', 'client'),
    packageDir: path.join(fallbackNodeModules, '@prisma', 'client'),
  };
}

export function patchPrismaModuleResolution(
  isDev: boolean,
  resourcesPath: string,
  appRoot: string,
  log: (message: string) => void
) {
  if (isDev) return;

  const { clientDir: prismaClientDir, packageDir: prismaPackageDir } = getPrismaBundlePaths(
    resourcesPath,
    appRoot
  );
  const defaultPath = path.join(prismaClientDir, 'default.js');

  if (!fs.existsSync(defaultPath)) {
    throw new Error(
      `Prisma client missing at ${defaultPath}. Reinstall the application or contact support.`
    );
  }

  const runtimeLibrary = resolveExisting(prismaPackageDir, 'runtime', 'library.js');
  if (!runtimeLibrary) {
    throw new Error(
      `Prisma runtime missing at ${path.join(prismaPackageDir, 'runtime', 'library.js')}`
    );
  }

  const nodeModule = Module as NodeModuleWithInternals;
  const nodePathParts = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);

  if (!nodePathParts.includes(prismaPackageDir)) {
    process.env.NODE_PATH = [prismaPackageDir, ...nodePathParts].join(path.delimiter);
    nodeModule._initPaths();
  }

  const originalResolve = nodeModule._resolveFilename.bind(nodeModule);
  nodeModule._resolveFilename = (request, parent, isMain, options) => {
    if (request === '.prisma/client/default') return defaultPath;
    if (request === '.prisma/client') return path.join(prismaClientDir, 'index.js');

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

  log(`Prisma client: ${prismaClientDir}`);
  log(`Prisma runtime: ${runtimeLibrary}`);
}
