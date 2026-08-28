import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const [stateFile, rawDepth = '0', rawBreadth = '1', behavior = 'graceful'] =
  process.argv.slice(2);
if (!stateFile) throw new Error('missing state file');

const depth = Number(rawDepth);
const breadth = Number(rawBreadth);
if (behavior === 'graceful') {
  process.once('SIGTERM', () => setTimeout(() => process.exit(0), 10));
} else if (behavior === 'late-child') {
  process.once('SIGTERM', () => {
    spawn(
      process.execPath,
      [new URL(import.meta.url).pathname, stateFile, '0', '1', 'stubborn'],
      { stdio: 'ignore' },
    );
    setTimeout(() => process.exit(0), 600);
  });
} else {
  process.on('SIGTERM', () => {});
}

appendFileSync(
  stateFile,
  `${JSON.stringify({ pid: process.pid, ppid: process.ppid, depth })}\n`,
);

if (depth > 0) {
  for (let index = 0; index < breadth; index += 1) {
    spawn(
      process.execPath,
      [new URL(import.meta.url).pathname, stateFile, String(depth - 1), String(breadth), behavior],
      { stdio: 'ignore' },
    );
  }
}

setInterval(() => {}, 60_000);
