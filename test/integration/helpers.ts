import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export interface SpawnedTree {
  child: ChildProcess;
  rootPid: number;
  pids: number[];
}

function expectedCount(depth: number, breadth: number): number {
  let count = 0;
  for (let level = 0; level <= depth; level += 1) count += breadth ** level;
  return count;
}

export async function waitForPids(
  stateFile: string,
  count: number,
  timeoutMs = 10_000,
): Promise<number[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const lines = (await readFile(stateFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean);
      if (lines.length >= count) {
        return lines.map((line) => (JSON.parse(line) as { pid: number }).pid);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await delay(10);
  }
  throw new Error(`timed out waiting for ${count} fixture processes`);
}

export async function spawnTree(
  stateFile: string,
  depth: number,
  breadth: number,
  behavior: 'graceful' | 'stubborn' | 'late-child',
  detached = false,
): Promise<SpawnedTree> {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../fixtures/process-tree.mjs', import.meta.url)),
      stateFile,
      String(depth),
      String(breadth),
      behavior,
    ],
    { detached, stdio: 'ignore' },
  );
  if (!child.pid) throw new Error('fixture did not start');
  const pids = await waitForPids(stateFile, expectedCount(depth, breadth));
  return { child, rootPid: child.pid, pids };
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function waitForExit(pid: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await delay(10);
  }
  throw new Error(`PID ${pid} survived cleanup`);
}

export async function cleanup(pids: readonly number[]): Promise<void> {
  for (const pid of [...pids].reverse()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  await Promise.all(pids.map((pid) => waitForExit(pid).catch(() => undefined)));
}
