import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertTargetPid, descendantsLeafFirst } from '../../src/graph.js';
import type { ProcessRecord } from '../../src/types.js';

function graph(...records: ProcessRecord[]): Map<number, ProcessRecord> {
  return new Map(records.map((record) => [record.pid, record]));
}

test('descendantsLeafFirst is deterministic and children precede parents', () => {
  const processes = graph(
    { pid: 1, ppid: 0 },
    { pid: 4, ppid: 2 },
    { pid: 3, ppid: 1 },
    { pid: 2, ppid: 1 },
    { pid: 5, ppid: 2 },
  );
  assert.deepEqual(descendantsLeafFirst(processes, 1), [4, 5, 2, 3, 1]);
  assert.deepEqual(descendantsLeafFirst(processes, 1, false), [4, 5, 2, 3]);
  assert.deepEqual(descendantsLeafFirst(processes, 99), []);
});

test('descendantsLeafFirst survives malformed cycles', () => {
  const processes = graph(
    { pid: 1, ppid: 2 },
    { pid: 2, ppid: 1 },
    { pid: 3, ppid: 1 },
  );
  assert.deepEqual(descendantsLeafFirst(processes, 1), [2, 3, 1]);
});

test('assertTargetPid rejects dangerous or invalid targets', () => {
  for (const value of [0, -1, 1.2, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => assertTargetPid(value), /positive safe integer/);
  }
  assert.throws(() => assertTargetPid(1), /refusing to target PID 1/);
  assert.doesNotThrow(() => assertTargetPid(1, true));
  assert.doesNotThrow(() => assertTargetPid(42));
});
