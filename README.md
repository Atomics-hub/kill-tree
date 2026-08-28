# kill-tree

[![npm version](https://img.shields.io/npm/v/kill-tree.svg)](https://www.npmjs.com/package/kill-tree)
[![CI](https://github.com/Atomics-hub/kill-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Atomics-hub/kill-tree/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Terminate a process tree without pretending one signal is enough.

```ts
import { terminateTree } from 'kill-tree';

const report = await terminateTree(server.pid!, {
  gracePeriodMs: 2_000,
});

if (report.survivors.length) {
  console.error('still alive:', report.survivors);
}
```

`kill-tree` snapshots descendants, signals leaves before parents, keeps discovering during shutdown, checks process identity before every signal, escalates after a grace period, and returns a report you can act on.

## Install

```sh
npm install kill-tree
```

- Zero runtime dependencies
- No native addon or install script
- ESM and CommonJS
- TypeScript declarations included
- Node.js 18+
- Linux, macOS, and Windows CI

## Replace `tree-kill` without changing imports

Use an npm alias:

```sh
npm install tree-kill@npm:kill-tree
```

The default export keeps the familiar callback API, including numeric-string PIDs:

```ts
import kill from 'tree-kill';

kill(pid, 'SIGTERM', (error) => {
  if (error) console.error(error);
});
```

The compatibility API is intentionally one-shot. Adopt `terminateTree` when you want escalation, repeated discovery, PID identity checks across passes, and a structured result.

## Modern API

### `terminateTree(pid, options?)`

```ts
const report = await terminateTree(pid, {
  signal: 'SIGTERM',
  forceSignal: 'SIGKILL',
  gracePeriodMs: 5_000,
  pollIntervalMs: 50,
  maxPasses: 256,
  includeRoot: true,
  ignoreMissing: true,
  abortSignal,
});
```

The result is evidence, not just absence of an exception:

```ts
interface TerminationReport {
  rootPid: number;
  platform: NodeJS.Platform;
  strategies: ('procfs' | 'ps' | 'powershell')[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  passes: number;
  discovered: number[];
  signaled: number[];
  exited: number[];
  survivors: number[];
  skipped: Array<{
    pid: number;
    reason: 'identity-changed' | 'not-found';
  }>;
  failures: Array<{
    pid: number;
    signal: NodeJS.Signals | number;
    code?: string;
    message: string;
  }>;
  escalated: boolean;
  aborted: boolean;
}
```

`ignoreMissing` defaults to `true`, making cleanup idempotent. Set it to `false` when a missing root should reject with `code === 'ESRCH'`.

PID 1 is rejected unless `allowPid1: true` is explicit.

### `signalTree(pid, options?)`

Take one tree snapshot and send one signal, leaves first:

```ts
import { signalTree } from 'kill-tree';

const report = await signalTree(pid, { signal: 'SIGINT' });
```

Use this for compatibility or non-termination signals. For reliable shutdown, prefer `terminateTree`.

### `spawnGuarded(command, args?, options?)`

The strongest cleanup starts when you create the child:

```ts
import { spawnGuarded } from 'kill-tree';

const worker = spawnGuarded('node', ['worker.js'], {
  stdio: 'inherit',
  termination: { gracePeriodMs: 1_000 },
});

console.log(worker.pid, worker.containment);
await worker.terminate();
```

On POSIX, owned children start in a separate process group and final cleanup targets that group. On Windows, `containment` is honestly reported as `snapshot`; there is no hidden native Job Object addon.

## CLI

```sh
npx kill-tree <pid> [signal]
npx kill-tree 4321 --force-after 2000 --json
```

Options:

```text
--force-after <ms>  grace period before escalation
--poll <ms>         liveness polling interval
--no-root           signal descendants but leave the root alive
--allow-pid-1       explicitly permit PID 1
--json              print the structured report
```

Exit code `0` means no tracked survivors or signal failures. Exit code `1` means cleanup was incomplete or the process was missing in strict CLI mode. Usage errors return `2`.

## What it can and cannot guarantee

| Target | Mechanism | Boundary |
| --- | --- | --- |
| Existing PID on Linux | `/proc` snapshots and start-time identity | A process that daemonizes and is reparented between snapshots can escape discovery. |
| Existing PID on macOS/other POSIX | `ps` snapshots and creation-time identity | Snapshot identity is only as precise as the platform data. |
| Existing PID on Windows | PowerShell/CIM snapshots and creation identity | Windows signals have Node's platform semantics; graceful signals are not POSIX-equivalent. |
| `spawnGuarded` on POSIX | Repeated snapshots plus a dedicated process group | A child can deliberately create a new session/process group and escape. |
| `spawnGuarded` on Windows | Repeated snapshots | This release does not claim kernel Job Object containment. |

No user-space package can prove it killed a descendant it never observed. `survivors` covers tracked process identities; it cannot list a process that escaped the ancestry graph before a snapshot. This package reports that boundary instead of marketing around it.

## Why snapshots instead of recursive shell commands?

- The full table is captured once per pass, avoiding one subprocess per descendant.
- Signals go through `process.kill`; PID and signal values are never interpolated into a shell command.
- Descendants are ordered leaf-first, reducing orphaning during ordinary shutdown.
- Repeated passes catch children created by signal handlers or shutdown races.
- Creation identity reduces the risk of signaling a reused PID.

Linux reads `/proc` directly. Other POSIX systems invoke `ps` with `execFile` (no shell). Windows invokes the built-in PowerShell CIM interface with a fixed command.

## Development

```sh
npm ci
npm run verify
npm run test:stress
```

The suite uses real isolated Node process trees, including graceful, signal-ignoring, branching, late-spawning, abort, CLI, ESM, CommonJS, and packed-tarball cases. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT © Atomics Hub
