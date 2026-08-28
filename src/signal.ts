import type {
  ProcessRecord,
  ProcessSignal,
  SignalFailure,
  SkippedProcess,
} from './types.js';
import { sameProcess } from './snapshot.js';

interface SignalResult {
  signaled: boolean;
  skipped?: SkippedProcess;
  failure?: SignalFailure;
}

export function sendSignal(
  expected: ProcessRecord,
  current: ProcessRecord | undefined,
  signal: ProcessSignal,
): SignalResult {
  if (!current) {
    return {
      signaled: false,
      skipped: { pid: expected.pid, reason: 'not-found' },
    };
  }
  if (!sameProcess(expected, current)) {
    return {
      signaled: false,
      skipped: { pid: expected.pid, reason: 'identity-changed' },
    };
  }

  try {
    process.kill(expected.pid, signal);
    return { signaled: true };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ESRCH') {
      return {
        signaled: false,
        skipped: { pid: expected.pid, reason: 'not-found' },
      };
    }
    return {
      signaled: false,
      failure: {
        pid: expected.pid,
        signal,
        ...(nodeError.code ? { code: nodeError.code } : {}),
        message: nodeError.message,
      },
    };
  }
}
