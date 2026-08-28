import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const tag = process.env.RELEASE_TAG;
assert.ok(tag, 'RELEASE_TAG is required');
assert.equal(tag, `v${packageJson.version}`, 'tag must match package version');
assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
console.log(`${packageJson.name}@${packageJson.version} is ready for ${tag}`);
