import fs from 'fs';
import path from 'path';

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing Prisma source directory: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

const root = process.cwd();
const outDir = path.join(root, 'build', 'prisma');

const sources = [
  { from: path.join(root, 'node_modules', '.prisma', 'client'), to: path.join(outDir, 'generated-client') },
  { from: path.join(root, 'node_modules', '@prisma', 'client'), to: path.join(outDir, 'npm-client') },
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const { from, to } of sources) {
  copyDir(from, to);
}

const required = [
  path.join(outDir, 'generated-client', 'default.js'),
  path.join(outDir, 'npm-client', 'runtime', 'library.js'),
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    throw new Error(`Prisma bundle verification failed: ${file}`);
  }
}

console.log('Prisma bundle prepared at build/prisma');
