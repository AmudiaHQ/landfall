// Builds the ESM package into dist/: readable modules for bundlers, one
// minified file for a <script type="module"> tag, and type declarations.
import { rm } from 'node:fs/promises';

import pkg from '../package.json';

const banner = `/*! Landfall ${pkg.version} | ${pkg.name} | Copyright 2026 Amudia (https://amudia.com) | Apache-2.0, see LICENSE and NOTICE | @license */`;

await rm('dist', { recursive: true, force: true });

const builds = [
  Bun.build({
    entrypoints: ['src/index.ts', 'src/react.ts'],
    outdir: 'dist',
    target: 'browser',
    format: 'esm',
    splitting: true,
    external: ['react'],
    naming: { chunk: 'chunks/[name]-[hash].[ext]' },
    banner,
  }),
  Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: 'landfall.min.js',
    banner,
  }),
];

for (const result of await Promise.all(builds)) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  for (const output of result.outputs) {
    const text = await output.text();
    if (!text.startsWith('/*!')) {
      console.error(`Missing license banner: ${output.path}`);
      process.exit(1);
    }
  }
}

const types = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
if (types.exitCode !== 0) process.exit(types.exitCode ?? 1);

console.log('Built dist/ (ESM, minified bundle, types).');
