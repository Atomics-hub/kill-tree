import { copyFile, rename } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
await rename(new URL('dist/index.cjs', root), new URL('dist/index.bundle.cjs', root));
await copyFile(new URL('src/index-shim.cjs', root), new URL('dist/index.cjs', root));
await copyFile(
  new URL('src/index-require.d.cts', root),
  new URL('dist/index.d.cts', root),
);
