import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

import type {
  ProcessRecord,
  ProcessSnapshot,
  SnapshotStrategy,
} from './types.js';

const execFileAsync = promisify(execFile);
const PROCFS_BATCH_SIZE = 256;

export function parseProcStat(input: string): ProcessRecord | undefined {
  const open = input.indexOf('(');
  const close = input.lastIndexOf(')');
  if (open <= 0 || close <= open) return undefined;

  const pid = Number(input.slice(0, open).trim());
  const fields = input.slice(close + 1).trim().split(/\s+/);
  const ppid = Number(fields[1]);
  const startTime = fields[19];

  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid)) return undefined;
  return {
    pid,
    ppid,
    ...(startTime ? { identity: startTime } : {}),
  };
}

export function parsePsSnapshot(input: string): Map<number, ProcessRecord> {
  const processes = new Map<number, ProcessRecord>();
  for (const line of input.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)(?:\s+(.+?))?\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid)) continue;
    const identity = match[3]?.trim();
    processes.set(pid, {
      pid,
      ppid,
      ...(identity ? { identity } : {}),
    });
  }
  return processes;
}

export function parsePowerShellSnapshot(input: string): Map<number, ProcessRecord> {
  const processes = new Map<number, ProcessRecord>();
  const trimmed = input.trim();
  if (!trimmed) return processes;

  const value: unknown = JSON.parse(trimmed);
  const rows = Array.isArray(value) ? value : [value];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const pid = Number(record.ProcessId);
    const ppid = Number(record.ParentProcessId);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid)) continue;
    const creationDate =
      typeof record.CreationDate === 'string' ? record.CreationDate : undefined;
    processes.set(pid, {
      pid,
      ppid,
      ...(creationDate ? { identity: creationDate } : {}),
    });
  }
  return processes;
}

async function captureProcfs(): Promise<Map<number, ProcessRecord>> {
  const entries = await readdir('/proc', { withFileTypes: true });
  const pids = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name);

  const records: Array<ProcessRecord | undefined> = [];
  for (let offset = 0; offset < pids.length; offset += PROCFS_BATCH_SIZE) {
    const batch = await Promise.all(
      pids.slice(offset, offset + PROCFS_BATCH_SIZE).map(async (pid) => {
        try {
          return parseProcStat(await readFile(`/proc/${pid}/stat`, 'utf8'));
        } catch {
          // Processes can exit between readdir() and readFile().
          return undefined;
        }
      }),
    );
    records.push(...batch);
  }

  return new Map(
    records
      .filter((record): record is ProcessRecord => record !== undefined)
      .map((record) => [record.pid, record]),
  );
}

async function capturePs(): Promise<Map<number, ProcessRecord>> {
  const execOptions = {
    encoding: 'utf8' as const,
    maxBuffer: 16 * 1024 * 1024,
  };
  try {
    const { stdout } = await execFileAsync(
      'ps',
      ['-axo', 'pid=,ppid=,lstart='],
      execOptions,
    );
    return parsePsSnapshot(stdout);
  } catch {
    // Some POSIX ps implementations do not expose lstart. Process identity is
    // weaker there, but tree enumeration can still proceed.
    const { stdout } = await execFileAsync(
      'ps',
      ['-axo', 'pid=,ppid='],
      execOptions,
    );
    return parsePsSnapshot(stdout);
  }
}

async function capturePowerShell(): Promise<Map<number, ProcessRecord>> {
  const script = [
    'Get-CimInstance Win32_Process',
    'Select-Object ProcessId,ParentProcessId,CreationDate',
    'ConvertTo-Json -Compress',
  ].join(' | ');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  return parsePowerShellSnapshot(stdout);
}

export async function captureProcessSnapshot(
  platform: NodeJS.Platform = process.platform,
): Promise<ProcessSnapshot> {
  let strategy: SnapshotStrategy;
  let processes: Map<number, ProcessRecord>;

  if (platform === 'linux') {
    strategy = 'procfs';
    processes = await captureProcfs();
  } else if (platform === 'win32') {
    strategy = 'powershell';
    processes = await capturePowerShell();
  } else {
    strategy = 'ps';
    processes = await capturePs();
  }

  return { capturedAt: Date.now(), strategy, processes };
}

export function sameProcess(
  expected: ProcessRecord,
  actual: ProcessRecord | undefined,
): boolean {
  if (!actual || expected.pid !== actual.pid) return false;
  if (expected.identity && actual.identity) {
    return expected.identity === actual.identity;
  }
  return true;
}
