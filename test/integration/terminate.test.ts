import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { signalTree, spawnGuarded, terminateTree } from '../../src/index.js';
import { cleanup, isAlive, spawnTree, waitForExit, waitForPids } from './helpers.js';

test('gracefully terminates a branching process tree leaf-first', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-graceful-'));
  const tree = await spawnTree(join(directory, 'pids'), 2, 2, 'graceful');
  t.after(() => cleanup(tree.pids));

  const report = await terminateTree(tree.rootPid, {
    gracePeriodMs: 1_000,
    pollIntervalMs: 10,
  });

  assert.equal(report.escalated, false);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.survivors, []);
  assert.deepEqual(new Set(report.discovered), new Set(tree.pids));
  await Promise.all(tree.pids.map((pid) => waitForExit(pid)));
});

test('escalates stubborn trees and leaves no survivors', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-force-'));
  const tree = await spawnTree(join(directory, 'pids'), 2, 2, 'stubborn');
  t.after(() => cleanup(tree.pids));

  const report = await terminateTree(tree.rootPid, {
    gracePeriodMs: 30,
    pollIntervalMs: 5,
  });

  assert.equal(report.escalated, process.platform !== 'win32');
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.survivors, []);
  await Promise.all(tree.pids.map((pid) => waitForExit(pid)));
});

test(
  'repeated discovery catches a descendant created during shutdown',
  { skip: process.platform === 'win32' },
  async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-late-'));
  const stateFile = join(directory, 'pids');
  const tree = await spawnTree(stateFile, 0, 1, 'late-child');
  const tracked = [...tree.pids];
  t.after(() => cleanup(tracked));

  const report = await terminateTree(tree.rootPid, {
    gracePeriodMs: 1_000,
    pollIntervalMs: 10,
  });
  const allPids = await waitForPids(stateFile, 2);
  tracked.push(...allPids.filter((pid) => !tracked.includes(pid)));

  assert.equal(report.escalated, true);
  assert.ok(report.discovered.includes(allPids[1]!));
  assert.deepEqual(report.survivors, []);
  await Promise.all(allPids.map((pid) => waitForExit(pid)));
  },
);

test('includeRoot false leaves the root alive while terminating descendants', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-no-root-'));
  const tree = await spawnTree(join(directory, 'pids'), 1, 2, 'graceful');
  t.after(() => cleanup(tree.pids));

  const report = await terminateTree(tree.rootPid, {
    includeRoot: false,
    gracePeriodMs: 500,
    pollIntervalMs: 10,
  });

  assert.equal(isAlive(tree.rootPid), true);
  assert.equal(report.discovered.includes(tree.rootPid), false);
  await Promise.all(tree.pids.slice(1).map((pid) => waitForExit(pid)));
});

test('an already-aborted operation reports the live tree as survivors', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-abort-'));
  const tree = await spawnTree(join(directory, 'pids'), 1, 1, 'stubborn');
  t.after(() => cleanup(tree.pids));
  const controller = new AbortController();
  controller.abort();

  const report = await terminateTree(tree.rootPid, {
    abortSignal: controller.signal,
  });

  assert.equal(report.aborted, true);
  assert.deepEqual(new Set(report.survivors), new Set(tree.pids));
  assert.deepEqual(report.signaled, []);
});

test('spawnGuarded owns and terminates a process group on POSIX', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-guarded-'));
  const stateFile = join(directory, 'pids');
  const guarded = spawnGuarded(
    process.execPath,
    [
      new URL('../fixtures/process-tree.mjs', import.meta.url).pathname,
      stateFile,
      '1',
      '2',
      'stubborn',
    ],
    { stdio: 'ignore' },
  );
  const pids = await waitForPids(stateFile, 3);
  t.after(() => cleanup(pids));

  assert.equal(
    guarded.containment,
    process.platform === 'win32' ? 'snapshot' : 'process-group',
  );
  const report = await guarded.terminate({ gracePeriodMs: 20, pollIntervalMs: 5 });
  assert.deepEqual(report.failures, []);
  await Promise.all(pids.map((pid) => waitForExit(pid)));
});

test('spawnGuarded respects includeRoot false', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-guarded-root-'));
  const stateFile = join(directory, 'pids');
  const guarded = spawnGuarded(
    process.execPath,
    [
      new URL('../fixtures/process-tree.mjs', import.meta.url).pathname,
      stateFile,
      '1',
      '1',
      'graceful',
    ],
    { stdio: 'ignore' },
  );
  const pids = await waitForPids(stateFile, 2);
  t.after(() => cleanup(pids));

  await guarded.terminate({
    includeRoot: false,
    gracePeriodMs: 500,
    pollIntervalMs: 10,
  });
  assert.equal(isAlive(guarded.pid), true);
  await waitForExit(pids[1]!);
});

test('signalTree provides one-shot leaf-first compatibility', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kill-tree-signal-'));
  const tree = await spawnTree(join(directory, 'pids'), 1, 2, 'stubborn');
  t.after(() => cleanup(tree.pids));

  const report = await signalTree(tree.rootPid, { signal: 'SIGKILL' });
  assert.deepEqual(report.failures, []);
  assert.deepEqual(new Set(report.discovered), new Set(tree.pids));
  assert.deepEqual(new Set(report.signaled), new Set(tree.pids));
  await Promise.all(tree.pids.map((pid) => waitForExit(pid)));
});
