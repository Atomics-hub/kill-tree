import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { terminateTree } from '../../src/index.js';
import { cleanup, spawnTree, waitForExit } from './helpers.js';

const runs = Number(process.env.KILL_TREE_STRESS_RUNS ?? 5);

test(`stress: ${runs} branching trees terminate without survivors`, async (t) => {
  for (let run = 0; run < runs; run += 1) {
    const directory = await mkdtemp(join(tmpdir(), `kill-tree-stress-${run}-`));
    const shapes = [
      { depth: 3, breadth: 2 },
      { depth: 2, breadth: 3 },
      { depth: 1, breadth: 8 },
    ] as const;
    const shape = shapes[run % shapes.length]!;
    const tree = await spawnTree(
      join(directory, 'pids'),
      shape.depth,
      shape.breadth,
      run % 2 === 0 ? 'graceful' : 'stubborn',
    );
    t.after(() => cleanup(tree.pids));
    const report = await terminateTree(tree.rootPid, {
      gracePeriodMs: 50,
      pollIntervalMs: 5,
    });
    assert.deepEqual(report.failures, [], `run ${run}`);
    assert.deepEqual(report.survivors, [], `run ${run}`);
    await Promise.all(tree.pids.map((pid) => waitForExit(pid)));
  }
});
