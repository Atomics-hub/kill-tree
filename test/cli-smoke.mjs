import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'kill-tree-cli-'));
const stateFile = join(directory, 'pids');
const fixture = new URL('./fixtures/process-tree.mjs', import.meta.url).pathname;
const child = spawn(process.execPath, [fixture, stateFile, '1', '2', 'stubborn'], {
  stdio: 'ignore',
});
if (!child.pid) throw new Error('CLI fixture failed to start');

const pids = [];
try {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const { readFile } = await import('node:fs/promises');
      const lines = (await readFile(stateFile, 'utf8')).trim().split('\n');
      if (lines.length >= 3) {
        pids.push(...lines.map((line) => JSON.parse(line).pid));
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(pids.length, 3, 'fixture tree did not become ready');

  const { stdout } = await execFileAsync(
    process.execPath,
    ['dist/cli.js', String(child.pid), '--force-after=20', '--poll=5', '--json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  const report = JSON.parse(stdout);
  assert.equal(report.rootPid, child.pid);
  assert.equal(report.escalated, process.platform !== 'win32');
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.survivors, []);

  const version = await execFileAsync(process.execPath, ['dist/cli.js', '--version'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.match(version.stdout, /^0\.1\.0\s*$/);
  console.log('CLI smoke test passed');
} finally {
  for (const pid of pids.reverse()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
}
