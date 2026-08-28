import { assertTargetPid, descendantsLeafFirst } from './graph.js';
import { sendSignal } from './signal.js';
import { captureProcessSnapshot, sameProcess } from './snapshot.js';
import type {
  ProcessRecord,
  ProcessSignal,
  SignalFailure,
  SignalTreeOptions,
  SignalTreeReport,
  SkippedProcess,
  SnapshotStrategy,
  TerminateTreeOptions,
  TerminationReport,
} from './types.js';

const DEFAULT_GRACE_PERIOD_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const DEFAULT_MAX_PASSES = 256;
const FORCE_WAIT_MS = 2_000;

interface NormalizedOptions {
  signal: ProcessSignal;
  forceSignal: ProcessSignal;
  gracePeriodMs: number;
  pollIntervalMs: number;
  maxPasses: number;
  includeRoot: boolean;
  ignoreMissing: boolean;
  allowPid1: boolean;
  abortSignal?: AbortSignal;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function normalizeOptions(options: TerminateTreeOptions): NormalizedOptions {
  const gracePeriodMs = nonNegativeFinite(
    options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS,
    'gracePeriodMs',
  );
  const pollIntervalMs = nonNegativeFinite(
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    'pollIntervalMs',
  );
  const maxPasses = positiveInteger(
    options.maxPasses ?? DEFAULT_MAX_PASSES,
    'maxPasses',
  );
  return {
    signal: options.signal ?? 'SIGTERM',
    forceSignal: options.forceSignal ?? 'SIGKILL',
    gracePeriodMs,
    pollIntervalMs,
    maxPasses,
    includeRoot: options.includeRoot ?? true,
    ignoreMissing: options.ignoreMissing ?? true,
    allowPid1: options.allowPid1 ?? false,
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  };
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function processNotFound(pid: number): Error {
  const error = new Error(`process ${pid} was not found`) as NodeJS.ErrnoException;
  error.code = 'ESRCH';
  return error;
}

function appendUniqueSkip(target: SkippedProcess[], value: SkippedProcess): void {
  if (!target.some((item) => item.pid === value.pid && item.reason === value.reason)) {
    target.push(value);
  }
}

function appendUniqueFailure(target: SignalFailure[], value: SignalFailure): void {
  if (
    !target.some(
      (item) =>
        item.pid === value.pid &&
        item.signal === value.signal &&
        item.code === value.code,
    )
  ) {
    target.push(value);
  }
}

export async function signalTree(
  pid: number,
  options: SignalTreeOptions = {},
): Promise<SignalTreeReport> {
  assertTargetPid(pid, options.allowPid1 ?? false);
  const signal = options.signal ?? 'SIGTERM';
  const includeRoot = options.includeRoot ?? true;
  const ignoreMissing = options.ignoreMissing ?? true;

  const discoveredSnapshot = await captureProcessSnapshot();
  const root = discoveredSnapshot.processes.get(pid);
  if (!root) {
    if (!ignoreMissing) throw processNotFound(pid);
    return {
      rootPid: pid,
      strategy: discoveredSnapshot.strategy,
      discovered: [],
      signaled: [],
      skipped: [],
      failures: [],
    };
  }

  const order = descendantsLeafFirst(
    discoveredSnapshot.processes,
    pid,
    includeRoot,
  );
  const currentSnapshot = await captureProcessSnapshot();
  const signaled: number[] = [];
  const skipped: SkippedProcess[] = [];
  const failures: SignalFailure[] = [];

  for (const targetPid of order) {
    const expected = discoveredSnapshot.processes.get(targetPid);
    if (!expected) continue;
    const result = sendSignal(
      expected,
      currentSnapshot.processes.get(targetPid),
      signal,
    );
    if (result.signaled) signaled.push(targetPid);
    if (result.skipped) appendUniqueSkip(skipped, result.skipped);
    if (result.failure) appendUniqueFailure(failures, result.failure);
  }

  return {
    rootPid: pid,
    strategy: discoveredSnapshot.strategy,
    discovered: order,
    signaled,
    skipped,
    failures,
  };
}

export async function terminateTree(
  pid: number,
  options: TerminateTreeOptions = {},
): Promise<TerminationReport> {
  const normalized = normalizeOptions(options);
  assertTargetPid(pid, normalized.allowPid1);

  const wallStartedAt = new Date();
  const startedAt = performance.now();
  const strategies = new Set<SnapshotStrategy>();
  const known = new Map<number, ProcessRecord>();
  const discovered = new Set<number>();
  const signaled = new Set<number>();
  const skipped: SkippedProcess[] = [];
  const failures: SignalFailure[] = [];
  let passes = 0;
  let escalated = false;

  const initial = await captureProcessSnapshot();
  strategies.add(initial.strategy);
  const rootIdentity = initial.processes.get(pid);

  if (!rootIdentity) {
    if (!normalized.ignoreMissing) throw processNotFound(pid);
    const endedAt = new Date();
    return {
      rootPid: pid,
      platform: process.platform,
      strategies: [...strategies],
      startedAt: wallStartedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: performance.now() - startedAt,
      passes,
      discovered: [],
      signaled: [],
      exited: [],
      survivors: [],
      skipped: [],
      failures: [],
      escalated: false,
      aborted: normalized.abortSignal?.aborted ?? false,
    };
  }

  for (const initialPid of descendantsLeafFirst(
    initial.processes,
    pid,
    normalized.includeRoot,
  )) {
    const record = initial.processes.get(initialPid);
    if (!record) continue;
    known.set(initialPid, record);
    discovered.add(initialPid);
  }

  const runPhase = async (
    phaseSignal: ProcessSignal,
    durationMs: number,
  ): Promise<void> => {
    const sentThisPhase = new Set<number>();
    let phasePasses = 0;
    let deadline: number | undefined;

    while (
      (phasePasses === 0 ||
        (phasePasses < normalized.maxPasses &&
          performance.now() <= (deadline ?? Number.POSITIVE_INFINITY))) &&
      !normalized.abortSignal?.aborted
    ) {
      const snapshot = await captureProcessSnapshot();
      passes += 1;
      phasePasses += 1;
      strategies.add(snapshot.strategy);

      const currentRoot = snapshot.processes.get(pid);
      if (sameProcess(rootIdentity, currentRoot)) {
        const order = descendantsLeafFirst(
          snapshot.processes,
          pid,
          normalized.includeRoot,
        );
        for (const targetPid of order) {
          const record = snapshot.processes.get(targetPid);
          if (!record) continue;
          const previous = known.get(targetPid);
          if (previous && !sameProcess(previous, record)) {
            appendUniqueSkip(skipped, {
              pid: targetPid,
              reason: 'identity-changed',
            });
            continue;
          }
          known.set(targetPid, record);
          discovered.add(targetPid);
        }
      } else if (currentRoot && normalized.includeRoot) {
        appendUniqueSkip(skipped, { pid, reason: 'identity-changed' });
      }

      const rootedOrder = sameProcess(rootIdentity, currentRoot)
        ? descendantsLeafFirst(
            snapshot.processes,
            pid,
            normalized.includeRoot,
          )
        : [];
      const knownTree = new Map(known);
      knownTree.set(pid, rootIdentity);
      const remainingKnown = descendantsLeafFirst(
        knownTree,
        pid,
        normalized.includeRoot,
      ).filter((targetPid) => !rootedOrder.includes(targetPid));
      const signalOrder = [...rootedOrder, ...remainingKnown];

      let aliveCount = 0;
      for (const targetPid of signalOrder) {
        const expected = known.get(targetPid);
        const current = snapshot.processes.get(targetPid);
        if (!expected || !sameProcess(expected, current)) continue;
        aliveCount += 1;
        if (sentThisPhase.has(targetPid)) continue;

        const result = sendSignal(expected, current, phaseSignal);
        if (result.signaled) {
          signaled.add(targetPid);
          sentThisPhase.add(targetPid);
        }
        if (result.skipped) appendUniqueSkip(skipped, result.skipped);
        if (result.failure) appendUniqueFailure(failures, result.failure);
      }

      deadline ??= performance.now() + durationMs;
      if (aliveCount === 0) return;
      await wait(normalized.pollIntervalMs, normalized.abortSignal);
    }
  };

  await runPhase(normalized.signal, normalized.gracePeriodMs);

  if (!normalized.abortSignal?.aborted) {
    const beforeForce = await captureProcessSnapshot();
    strategies.add(beforeForce.strategy);
    const hasSurvivors = [...known.values()].some((record) =>
      sameProcess(record, beforeForce.processes.get(record.pid)),
    );
    if (hasSurvivors) {
      escalated = normalized.forceSignal !== normalized.signal;
      await runPhase(normalized.forceSignal, FORCE_WAIT_MS);
    }
  }

  const finalSnapshot = await captureProcessSnapshot();
  strategies.add(finalSnapshot.strategy);
  const survivors = [...known.values()]
    .filter((record) => sameProcess(record, finalSnapshot.processes.get(record.pid)))
    .map((record) => record.pid)
    .sort((a, b) => a - b);
  const exited = [...discovered]
    .filter((targetPid) => !survivors.includes(targetPid))
    .sort((a, b) => a - b);
  const endedAt = new Date();

  return {
    rootPid: pid,
    platform: process.platform,
    strategies: [...strategies],
    startedAt: wallStartedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: performance.now() - startedAt,
    passes,
    discovered: [...discovered].sort((a, b) => a - b),
    signaled: [...signaled].sort((a, b) => a - b),
    exited,
    survivors,
    skipped,
    failures,
    escalated,
    aborted: normalized.abortSignal?.aborted ?? false,
  };
}
