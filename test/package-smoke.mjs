import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = new URL('..', import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'kill-tree-package-'));
const packed = await execFileAsync(
  'npm',
  ['pack', '--json', '--pack-destination', directory],
  { cwd: packageRoot, encoding: 'utf8' },
);
const [manifest] = JSON.parse(packed.stdout);
assert.ok(manifest.filename);
const names = new Set(manifest.files.map((file) => file.path));
for (const required of [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.bundle.cjs',
  'dist/index.d.ts',
  'dist/cli.js',
]) {
  assert.ok(names.has(required), `tarball is missing ${required}`);
}
assert.ok([...names].every((name) => !name.startsWith('test/')));
assert.ok([...names].every((name) => !name.startsWith('src/')));

const consumer = join(directory, 'consumer');
await writeFile(join(directory, 'placeholder'), '');
await import('node:fs/promises').then(({ mkdir }) => mkdir(consumer));
await writeFile(join(consumer, 'package.json'), '{"type":"module"}\n');
const tarball = join(directory, manifest.filename);
await execFileAsync(
  'npm',
  ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: consumer, encoding: 'utf8' },
);

const esm = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '--eval',
    "import api from '@a5omic/kill-tree'; console.log(typeof api)",
  ],
  { cwd: consumer, encoding: 'utf8' },
);
assert.equal(esm.stdout.trim(), 'function');
const cjs = await execFileAsync(
  process.execPath,
  [
    '--input-type=commonjs',
    '--eval',
    "const kill = require('@a5omic/kill-tree'); console.log(typeof kill, typeof kill.terminateTree)",
  ],
  { cwd: consumer, encoding: 'utf8' },
);
assert.equal(cjs.stdout.trim(), 'function function');
await writeFile(
  join(consumer, 'esm.ts'),
  `import kill, { terminateTree } from '@a5omic/kill-tree';
kill(123, 'SIGTERM', (error) => void error);
void terminateTree(123).then((report) => report.survivors);
`,
);
await writeFile(
  join(consumer, 'commonjs.cts'),
  `import kill = require('@a5omic/kill-tree');
kill('123', (error) => void error);
void kill.terminateTree(123).then((report) => report.failures);
`,
);
await execFileAsync(
  process.execPath,
  [
    new URL('../node_modules/typescript/bin/tsc', import.meta.url).pathname,
    '--noEmit',
    '--strict',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--typeRoots',
    new URL('../node_modules/@types', import.meta.url).pathname,
    'esm.ts',
    'commonjs.cts',
  ],
  { cwd: consumer, encoding: 'utf8' },
);
const version = await execFileAsync(
  process.execPath,
  ['node_modules/@a5omic/kill-tree/dist/cli.js', '--version'],
  { cwd: consumer, encoding: 'utf8' },
);
assert.equal(version.stdout.trim(), '0.1.0');
console.log('packed ESM, CJS, types, and CLI smoke tests passed');
