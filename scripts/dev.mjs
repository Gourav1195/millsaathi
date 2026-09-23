import { spawn } from 'node:child_process';
import net from 'node:net';

const children = [];

function portBusy(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

for (const port of [3000, 8787]) {
  if (await portBusy(port)) {
    console.warn(`Port ${port} is already in use. Stop the old dev server in that terminal (Ctrl+C) or the UI may stay stale.`);
  }
}

function run(label, args) {
  const child = spawn('npm', args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

console.log('');
console.log('MillSaathi local dev');
console.log('  React (hot reload) → http://localhost:3000/app');
console.log('  Worker API only    → http://127.0.0.1:8787/api/*');
console.log('');
console.log('Use :3000 while editing apps/web. A dev bar at the bottom shows API status and whether you are on the right port.');
console.log('If the UI looks stale: stop dev, delete apps/web/.next, restart, and open :3000 (not :8787).');
console.log('');

// Start the Worker API first so Next rewrites to :8787 succeed on the first page load.
run('worker', ['run', 'dev:worker']);
setTimeout(() => run('web', ['run', 'dev:web']), 1500);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
