import type { ChildProcess, SpawnOptions } from 'node:child_process';

export type ProcessSignal = NodeJS.Signals | number;

export interface ProcessRecord {
  pid: number;
  ppid: number;
  /** Platform-specific process creation identity, when available. */
  identity?: string;
}

export type SnapshotStrategy = 'procfs' | 'ps' | 'powershell';

export interface ProcessSnapshot {
  capturedAt: number;
  strategy: SnapshotStrategy;
  processes: Map<number, ProcessRecord>;
}

export interface TerminateTreeOptions {
  /** First signal sent. Defaults to SIGTERM. */
  signal?: ProcessSignal;
  /** Signal used after the grace period. Defaults to SIGKILL. */
  forceSignal?: ProcessSignal;
  /** Milliseconds to wait before escalation. Defaults to 5,000. */
  gracePeriodMs?: number;
  /** Milliseconds between liveness checks. Defaults to 50. */
  pollIntervalMs?: number;
  /** Maximum tree-discovery passes per phase. Defaults to 256. */
  maxPasses?: number;
  /** Include the root process itself. Defaults to true. */
  includeRoot?: boolean;
  /** Resolve instead of throwing when the root is already absent. Defaults to true. */
  ignoreMissing?: boolean;
  /** Permit targeting PID 1. Disabled by default as a safety guard. */
  allowPid1?: boolean;
  /** Stop work early when aborted. */
  abortSignal?: AbortSignal;
}

export interface SignalFailure {
  pid: number;
  signal: ProcessSignal;
  code?: string;
  message: string;
}

export interface SkippedProcess {
  pid: number;
  reason: 'identity-changed' | 'not-found';
}

export interface TerminationReport {
  rootPid: number;
  platform: NodeJS.Platform;
  strategies: SnapshotStrategy[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  passes: number;
  discovered: number[];
  signaled: number[];
  exited: number[];
  survivors: number[];
  skipped: SkippedProcess[];
  failures: SignalFailure[];
  escalated: boolean;
  aborted: boolean;
}

export interface SignalTreeOptions {
  signal?: ProcessSignal;
  includeRoot?: boolean;
  ignoreMissing?: boolean;
  allowPid1?: boolean;
}

export interface SignalTreeReport {
  rootPid: number;
  strategy: SnapshotStrategy;
  discovered: number[];
  signaled: number[];
  skipped: SkippedProcess[];
  failures: SignalFailure[];
}

export type ContainmentLevel = 'process-group' | 'snapshot';

export interface SpawnGuardedOptions extends Omit<SpawnOptions, 'detached'> {
  termination?: TerminateTreeOptions;
  /** Best-effort cleanup of the owned process group/root on host exit. Defaults to true. */
  cleanupOnExit?: boolean;
}

export interface GuardedChild {
  child: ChildProcess;
  pid: number;
  containment: ContainmentLevel;
  terminate(options?: TerminateTreeOptions): Promise<TerminationReport>;
}
