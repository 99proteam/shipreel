// Renders one square sample video per built-in template into site-videos/ for the demo website.
// Usage: npm run build && node scripts/render-samples.mjs
import { mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { buildPlan, findRelease, launchBrowser, loadConfig, renderVideos } from '../dist/index.js';

const out = path.resolve('site-videos');
mkdirSync(out, { recursive: true });

const samples = [
  { template: 'minimal', fixture: 'keep-a-changelog.md', name: 'acme-ui', repo: 'acme/acme-ui', cta: 'npm i acme-ui@latest', brandColor: '#6d28d9' },
  { template: 'terminal', fixture: 'conventional-changelog.md', name: 'fastq', repo: 'fastq/fastq', cta: 'npm i fastq@latest', brandColor: '#22d3ee' },
  { template: 'bold', fixture: 'release-please.md', name: 'cloudkit', repo: 'cloudkit/sdk-js', cta: 'npm i @cloudkit/sdk@latest', brandColor: '#ff5a1f' },
];

const browser = await launchBrowser();
try {
  for (const sample of samples) {
    const release = findRelease(readFileSync(path.join('tests/fixtures', sample.fixture), 'utf8'));
    // A throwaway cwd keeps the repo's own shipreel.config.json out of the samples.
    const config = loadConfig({
      cwd: out,
      overrides: { template: sample.template, name: sample.name, repo: sample.repo, cta: sample.cta, brandColor: sample.brandColor, sizes: 'square', outDir: out },
    });
    const [video] = await renderVideos(buildPlan(release, config), { browser });
    const target = path.join(out, `${sample.template}.mp4`);
    renameSync(video.file, target);
    console.log(`${target} (${video.durationSeconds.toFixed(1)}s)`);
  }
} finally {
  await browser.close();
}
