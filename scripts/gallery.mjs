// Regenerates the template screenshots used in the README: `npm run build && node scripts/gallery.mjs`
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildPlan, findRelease, launchBrowser, loadConfig, startSceneServer } from '../dist/index.js';

const out = path.resolve('docs/images');
mkdirSync(out, { recursive: true });
const release = findRelease(readFileSync('tests/fixtures/keep-a-changelog.md', 'utf8'));
const shots = [
  // [template, scene index, seconds into the scene]
  ['minimal', 1, 1.8],
  ['terminal', 1, 1.8],
  ['bold', 1, 1.8],
];

const browser = await launchBrowser();
for (const [template, scene, at] of shots) {
  const config = loadConfig({
    overrides: { template, name: 'acme-ui', repo: 'acme/acme-ui', cta: 'npm i acme-ui@latest', sizes: 'landscape', brandColor: undefined },
  });
  const plan = buildPlan(release, { ...config, brandColor: undefined });
  const server = await startSceneServer({ getPlan: () => plan });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${server.url}/scene/landscape/${scene}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((ms) => window.__shipreelSeek(ms), at * 1000);
  await page.screenshot({ path: path.join(out, `template-${template}.png`), scale: 'css', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  await page.close();
  await server.close();
  console.log(`docs/images/template-${template}.png`);
}
await browser.close();
