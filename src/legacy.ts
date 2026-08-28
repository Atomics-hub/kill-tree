import { assertTargetPid } from './graph.js';
import { signalTree } from './terminate.js';
import type { ProcessSignal } from './types.js';

export type LegacyCallback = (error?: Error) => void;

function reportError(
  failures: Array<{ pid: number; code?: string; message: string }>,
): Error | undefined {
  if (failures.length === 0) return undefined;
  if (failures.length === 1) {
    const failure = failures[0]!;
    const error = new Error(
      `PID ${failure.pid}: ${failure.message}`,
    ) as NodeJS.ErrnoException;
    if (failure.code) error.code = failure.code;
    return error;
  }
  return new AggregateError(
    failures.map((failure) => new Error(`PID ${failure.pid}: ${failure.message}`)),
    `failed to signal ${failures.length} process${failures.length === 1 ? '' : 'es'}`,
  );
}

export function legacyTreeKill(
  pid: number | string,
  callback?: LegacyCallback,
): void;
export function legacyTreeKill(
  pid: number | string,
  signal?: ProcessSignal,
  callback?: LegacyCallback,
): void;
export function legacyTreeKill(
  pid: number | string,
  signalOrCallback?: ProcessSignal | LegacyCallback,
  maybeCallback?: LegacyCallback,
): void {
  const normalizedPid =
    typeof pid === 'string' && /^\d+$/.test(pid) ? Number(pid) : pid;
  assertTargetPid(normalizedPid as number, false);

  const callback =
    typeof signalOrCallback === 'function' ? signalOrCallback : maybeCallback;
  const signal =
    typeof signalOrCallback === 'function' ? undefined : signalOrCallback;

  const operation = signalTree(normalizedPid as number, {
    ...(signal !== undefined ? { signal } : {}),
    ignoreMissing: false,
  });

  if (callback) {
    void operation.then(
      (report) => callback(reportError(report.failures)),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error))),
    );
  } else {
    void operation.catch((error: unknown) => {
      queueMicrotask(() => {
        throw error;
      });
    });
  }
}
