import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../src/cli.js';

test('parseArgs parses positional arguments and every switch', () => {
  assert.deepEqual(
    parseArgs([
      '123',
      'SIGINT',
      '--force-after=25',
      '--poll',
      '3',
      '--no-root',
      '--allow-pid-1',
      '--json',
    ]),
    {
      pid: 123,
      signal: 'SIGINT',
      gracePeriodMs: 25,
      pollIntervalMs: 3,
      includeRoot: false,
      allowPid1: true,
      json: true,
      help: false,
      version: false,
    },
  );
  assert.equal(parseArgs(['123', '9']).signal, 9);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['--', '123']).pid, 123);
});

test('parseArgs rejects malformed options', () => {
  assert.throws(() => parseArgs(['--wat']), /unknown option/);
  assert.throws(() => parseArgs(['1', 'SIGTERM', 'extra']), /too many/);
  assert.throws(() => parseArgs(['--poll']), /requires a value/);
  assert.throws(() => parseArgs(['--poll', '-1']), /non-negative/);
  assert.throws(() => parseArgs(['--force-after=nope']), /non-negative/);
});
