import assert from 'node:assert/strict';
import { test } from 'node:test';

import treeKill, { signalTree, terminateTree } from '../../src/index.js';

const absentPid = 2_147_483_647;

test('terminateTree reports an already absent process', async () => {
  const report = await terminateTree(absentPid);
  assert.equal(report.rootPid, absentPid);
  assert.deepEqual(report.discovered, []);
  assert.deepEqual(report.survivors, []);
  assert.equal(report.escalated, false);
});

test('strict missing mode returns an ESRCH error', async () => {
  await assert.rejects(
    terminateTree(absentPid, { ignoreMissing: false }),
    (error: NodeJS.ErrnoException) => error.code === 'ESRCH',
  );
  await assert.rejects(
    signalTree(absentPid, { ignoreMissing: false }),
    (error: NodeJS.ErrnoException) => error.code === 'ESRCH',
  );
});

test('signalTree treats a missing process as a successful no-op by default', async () => {
  const report = await signalTree(absentPid);
  assert.deepEqual(report.signaled, []);
  assert.deepEqual(report.failures, []);
});

test('terminateTree validates options before taking a snapshot', async () => {
  await assert.rejects(terminateTree(2, { gracePeriodMs: -1 }), /gracePeriodMs/);
  await assert.rejects(terminateTree(2, { pollIntervalMs: Number.NaN }), /pollIntervalMs/);
  await assert.rejects(terminateTree(2, { maxPasses: 0 }), /maxPasses/);
  await assert.rejects(terminateTree(1), /PID 1/);
});

test('legacy adapter accepts numeric strings and calls back once', async () => {
  let calls = 0;
  await new Promise<void>((resolve, reject) => {
    treeKill(String(absentPid), (error) => {
      calls += 1;
      if (error && (error as NodeJS.ErrnoException).code === 'ESRCH') resolve();
      else reject(error ?? new Error('expected an ESRCH error'));
    });
  });
  assert.equal(calls, 1);
  assert.throws(() => treeKill('not-a-pid'), /positive safe integer/);
});
