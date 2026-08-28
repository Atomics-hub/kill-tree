export { legacyTreeKill as default, legacyTreeKill } from './legacy.js';
export { spawnGuarded } from './guarded.js';
export { signalTree, terminateTree } from './terminate.js';
export type {
  ContainmentLevel,
  GuardedChild,
  ProcessRecord,
  ProcessSignal,
  ProcessSnapshot,
  SignalFailure,
  SignalTreeOptions,
  SignalTreeReport,
  SkippedProcess,
  SnapshotStrategy,
  SpawnGuardedOptions,
  TerminateTreeOptions,
  TerminationReport,
} from './types.js';
