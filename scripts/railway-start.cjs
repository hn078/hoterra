const { spawn } = require('node:child_process');

const service = (process.env.RAILWAY_SERVICE_NAME || '').toLowerCase();

function runNpm(script) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['run', script], { stdio: 'inherit', env: process.env });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

if (service === 'backend') {
  runNpm('start:backend');
} else if (service === 'frontend') {
  runNpm('start:frontend');
} else {
  console.error(`Unsupported Railway service: ${service || '(missing)'}`);
  process.exit(1);
}
