import { build } from 'esbuild';

// reviewer-core is consumed as raw TS via a tsconfig path alias, not a built
// npm package — esbuild inlines it (and every other relative import) into
// the bundle, while real npm deps (native addons like @ast-grep/napi
// included) stay external and get resolved from node_modules at runtime.
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  tsconfig: 'tsconfig.json',
});
