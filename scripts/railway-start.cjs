const { spawn, spawnSync } = require('node:child_process');

const service = (process.env.RAILWAY_SERVICE_NAME || '').toLowerCase();
const port = process.env.PORT || (service === 'frontend' ? '8080' : '3211');

function runNode(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

if (service === 'backend') {
  const prisma = require.resolve('prisma/build/index.js');
  const synced = spawnSync(
    process.execPath,
    [prisma, 'db', 'push', '--accept-data-loss'],
    { stdio: 'inherit', env: process.env }
  );

  if (synced.status !== 0) process.exit(synced.status ?? 1);
  runNode(['dist-server/index.js']);
} else if (service === 'frontend') {
  const vite = require.resolve('vite/bin/vite.js');
  runNode([vite, 'preview', '--host', '0.0.0.0', '--port', port]);
} else {
  console.error(`Unsupported Railway service: ${service || '(missing)'}`);
  process.exit(1);
}
