import { spawn } from 'node:child_process';

import { terminateTree } from './terminate.js';
import type {
  ContainmentLevel,
  GuardedChild,
  SpawnGuardedOptions,
  TerminateTreeOptions,
} from './types.js';

const exitCleanup = new Map<number, ContainmentLevel>();
let exitCleanupInstalled = false;

function installExitCleanup(): void {
  if (exitCleanupInstalled) return;
  exitCleanupInstalled = true;
  process.once('exit', () => {
    for (const [pid, containment] of exitCleanup) {
      try {
        process.kill(containment === 'process-group' ? -pid : pid, 'SIGKILL');
      } catch {
        // The process is already gone or cannot be signaled during host exit.
      }
    }
  });
}

function signalGroup(pid: number, signal: NodeJS.Signals | number): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export function spawnGuarded(
  command: string,
  args?: readonly string[],
  options: SpawnGuardedOptions = {},
): GuardedChild {
  const {
    termination,
    cleanupOnExit = true,
    ...spawnOptions
  } = options;
  const containment: ContainmentLevel =
    process.platform === 'win32' ? 'snapshot' : 'process-group';
  const child = spawn(command, args ?? [], {
    ...spawnOptions,
    detached: containment === 'process-group',
  });

  if (!child.pid) {
    child.once('error', () => {});
    throw new Error(`failed to spawn ${command}`);
  }
  const pid = child.pid;

  if (cleanupOnExit) {
    exitCleanup.set(pid, containment);
    installExitCleanup();
  }
  child.once('exit', () => exitCleanup.delete(pid));
  child.once('error', () => exitCleanup.delete(pid));

  return {
    child,
    pid,
    containment,
    async terminate(overrides: TerminateTreeOptions = {}) {
      const merged = { ...termination, ...overrides };
      const report = await terminateTree(pid, merged);
      if (containment === 'process-group' && merged.includeRoot !== false) {
        signalGroup(pid, merged.forceSignal ?? 'SIGKILL');
      }
      exitCleanup.delete(pid);
      return report;
    },
  };
}
