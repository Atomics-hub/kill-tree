import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [
  stateFile,
  rawDepth = '0',
  rawBreadth = '1',
  behavior = 'graceful',
  recordMode = 'self',
] = process.argv.slice(2);
if (!stateFile) throw new Error('missing state file');

const depth = Number(rawDepth);
const breadth = Number(rawBreadth);
const fixturePath = fileURLToPath(import.meta.url);
if (behavior === 'graceful') {
  process.once('SIGTERM', () => setTimeout(() => process.exit(0), 10));
} else if (behavior === 'late-child') {
  process.once('SIGTERM', () => {
    const child = spawn(
      process.execPath,
      [fixturePath, stateFile, '0', '1', 'stubborn', 'parent-announced'],
      { stdio: 'ignore' },
    );
    if (child.pid) {
      appendFileSync(
        stateFile,
        `${JSON.stringify({ pid: child.pid, ppid: process.pid, depth: 0 })}\n`,
      );
    }
    setTimeout(() => process.exit(0), 600);
  });
} else {
  process.on('SIGTERM', () => {});
}

// Let Node arm signal watchers before declaring the process ready.
await new Promise((resolve) => setImmediate(resolve));
if (recordMode === 'self') {
  appendFileSync(
    stateFile,
    `${JSON.stringify({ pid: process.pid, ppid: process.ppid, depth })}\n`,
  );
}

if (depth > 0) {
  for (let index = 0; index < breadth; index += 1) {
    spawn(
      process.execPath,
      [fixturePath, stateFile, String(depth - 1), String(breadth), behavior],
      { stdio: 'ignore' },
    );
  }
}

setInterval(() => {}, 60_000);
