import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node20',
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: { cli: 'src/cli.ts', action: 'src/action/main.ts' },
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
  },
]);
