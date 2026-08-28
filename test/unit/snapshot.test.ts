import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  captureProcessSnapshot,
  parsePowerShellSnapshot,
  parseProcStat,
  parsePsSnapshot,
  sameProcess,
} from '../../src/snapshot.js';

test('parseProcStat handles process names containing spaces and parentheses', () => {
  const fields = ['S', '42', ...Array.from({ length: 17 }, (_, i) => String(i)), '98765'];
  const record = parseProcStat(`123 (a tricky ) name) ${fields.join(' ')}`);
  assert.deepEqual(record, { pid: 123, ppid: 42, identity: '98765' });
});

test('parseProcStat rejects malformed records', () => {
  assert.equal(parseProcStat('nope'), undefined);
  assert.equal(parseProcStat('x (name) S 1'), undefined);
  assert.equal(parseProcStat('1 (name) S nope'), undefined);
});

test('parsePsSnapshot accepts identity text and ignores junk', () => {
  const processes = parsePsSnapshot(`
      10     1 Mon Aug 25 10:11:12 2026
      junk
      11    10 Tue Aug 26 12:00:00 2026
  `);
  assert.deepEqual(processes.get(10), {
    pid: 10,
    ppid: 1,
    identity: 'Mon Aug 25 10:11:12 2026',
  });
  assert.equal(processes.get(11)?.ppid, 10);
  assert.equal(processes.size, 2);
});

test('parsePowerShellSnapshot accepts zero, one, and many rows', () => {
  assert.equal(parsePowerShellSnapshot('').size, 0);
  assert.deepEqual(
    parsePowerShellSnapshot(
      JSON.stringify({
        ProcessId: 12,
        ParentProcessId: 1,
        CreationDate: '20260826120000.000000-000',
      }),
    ).get(12),
    {
      pid: 12,
      ppid: 1,
      identity: '20260826120000.000000-000',
    },
  );
  const many = parsePowerShellSnapshot(
    JSON.stringify([
      { ProcessId: 20, ParentProcessId: 12 },
      null,
      { ProcessId: 'bad', ParentProcessId: 12 },
    ]),
  );
  assert.deepEqual(many.get(20), { pid: 20, ppid: 12 });
  assert.equal(many.size, 1);
});

test('sameProcess compares identity when both snapshots provide it', () => {
  const expected = { pid: 1_000, ppid: 1, identity: 'first' };
  assert.equal(sameProcess(expected, undefined), false);
  assert.equal(sameProcess(expected, { ...expected, pid: 1_001 }), false);
  assert.equal(sameProcess(expected, { ...expected, identity: 'second' }), false);
  assert.equal(sameProcess(expected, { pid: 1_000, ppid: 2 }), true);
  assert.equal(sameProcess(expected, { ...expected }), true);
});

test('captureProcessSnapshot sees the current process', async () => {
  const snapshot = await captureProcessSnapshot();
  assert.ok(snapshot.capturedAt <= Date.now());
  assert.ok(snapshot.processes.has(process.pid));
  assert.ok(['procfs', 'ps', 'powershell'].includes(snapshot.strategy));
});
