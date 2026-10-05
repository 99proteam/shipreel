// Builds the demo website into _site/ (deployed to GitHub Pages by .github/workflows/pages.yml).
// Sample MP4s are picked up from site-videos/ when present (the Pages workflow renders them).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const out = path.resolve('_site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ['src/web/demo.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: true,
  outfile: path.join(out, 'assets/demo.js'),
});

cpSync('site', out, { recursive: true });
cpSync('templates', path.join(out, 'templates'), { recursive: true });
cpSync('docs/images', path.join(out, 'images'), { recursive: true });
mkdirSync(path.join(out, 'samples'), { recursive: true });
for (const sample of ['keep-a-changelog.md', 'conventional-changelog.md', 'github-release-notes.md', 'release-please.md']) {
  cpSync(path.join('tests/fixtures', sample), path.join(out, 'samples', sample));
}
if (existsSync('site-videos')) {
  cpSync('site-videos', path.join(out, 'videos'), { recursive: true });
  console.log(`videos: ${readdirSync('site-videos').join(', ')}`);
}
console.log(`site built in ${out}`);
