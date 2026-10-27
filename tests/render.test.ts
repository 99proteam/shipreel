import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { buildPlan, FALLBACK_HIGHLIGHT } from '../src/plan.js';
import { encoderArgs, gifArgs } from '../src/render/encode.js';
import { buildSceneView, contrastColor, renderSceneDocument } from '../src/render/scene.js';
import { BUILTIN_TEMPLATES, loadTemplate, renderString } from '../src/render/template.js';
import { posterFrame, siblingFile, videoFileName } from '../src/render/render.js';
import type { ParsedRelease } from '../src/types.js';

const release: ParsedRelease = {
  version: '2.4.0',
  date: '2026-09-30',
  items: [
    { kind: 'feature', raw: 'Tom & Jerry "mode"', breaking: false },
    { kind: 'feature', raw: 'Dark mode', breaking: false },
    { kind: 'fix', raw: 'Fix a', breaking: false },
    { kind: 'fix', raw: 'Fix b', breaking: false },
  ],
};

function emptyDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'shipreel-render-'));
}

describe('renderString', () => {
  it('escapes, renders raw, sections, inverted sections and loops', () => {
    const out = renderString('{{a}}|{{{a}}}|{{#yes}}Y{{/yes}}{{^no}}N{{/no}}|{{#list}}[{{x}}{{#on}}*{{/on}}]{{/list}}|{{o.k}}', {
      a: '<b>',
      yes: true,
      no: '',
      list: [{ x: 1, on: true }, { x: 2 }],
      o: { k: 'deep' },
    });
    expect(out).toBe('&lt;b&gt;|<b>|YN|[1*][2]|deep');
  });
});

describe('templates', () => {
  it.each(BUILTIN_TEMPLATES)('built-in template %s loads all scenes', (name) => {
    const template = loadTemplate(name);
    expect(Object.keys(template.scenes).sort()).toEqual(['fixes', 'highlight', 'intro', 'outro']);
    expect(template.styles).toEqual(['styles.css']);
  });

  it('loads a custom template folder without a manifest', () => {
    const dir = emptyDir();
    for (const scene of ['intro', 'highlight', 'fixes', 'outro']) writeFileSync(path.join(dir, `${scene}.html`), `<p>${scene}</p>`);
    writeFileSync(path.join(dir, 'styles.css'), 'p{color:red}');
    const template = loadTemplate(dir);
    expect(template.name).toBe(path.basename(dir));
    expect(template.defaults.font).toBe('Inter');
  });

  it('loads the documented example template', () => {
    const template = loadTemplate(path.resolve('examples/custom-template'));
    expect(template.name).toBe('neon');
    expect(template.defaults).toEqual({ font: 'Space Grotesk', brandColor: '#f472b6' });
  });

  it('reports missing scenes', () => {
    const dir = emptyDir();
    writeFileSync(path.join(dir, 'intro.html'), '');
    expect(() => loadTemplate(dir)).toThrow(/missing the highlight scene/);
    expect(() => loadTemplate('does-not-exist')).toThrow(/not found/);
  });
});

describe('plan and scene documents', () => {
  const cwd = emptyDir();
  mkdirSync(path.join(cwd, 'assets'));
  writeFileSync(path.join(cwd, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const config = loadConfig({ cwd, overrides: { name: 'acme-ui', repo: 'acme/acme-ui', sizes: 'square', logo: 'assets/logo.svg' } });

  it('builds a plan with highlights, fix count and timeline', () => {
    const plan = buildPlan(release, config);
    expect(plan.content.highlights.map((h) => h.text)).toEqual(['Tom & Jerry "mode"', 'Dark mode']);
    expect(plan.content.fixCount).toBe(2);
    expect(plan.timeline.scenes.map((s) => s.type)).toEqual(['intro', 'highlight', 'highlight', 'fixes', 'outro']);
    expect(plan.brandColor).toBe('#6d28d9');
    expect(plan.font).toBe('Inter');
    expect(plan.logoDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('uses a fallback highlight for empty releases', () => {
    const plan = buildPlan({ version: '1.0.0', items: [] }, config);
    expect(plan.content.highlights).toEqual([{ kind: 'other', text: FALLBACK_HIGHLIGHT }]);
  });

  it('exposes template variables', () => {
    const plan = buildPlan(release, config);
    const size = config.sizes[0]!;
    const intro = buildSceneView(plan, size, plan.timeline.scenes[0]!);
    expect(intro).toMatchObject({ projectName: 'acme-ui', versionLabel: 'v2.4.0', dateLabel: 'Sep 30, 2026', repoLabel: 'github.com/acme/acme-ui', monogram: 'A' });
    const highlight = buildSceneView(plan, size, plan.timeline.scenes[2]!);
    expect(highlight).toMatchObject({ text: 'Dark mode', index: 2, total: 2, kindLabel: 'New', textSize: 'xl' });
    expect(highlight.dots).toEqual([{ active: false, done: true }, { active: true, done: false }]);
    const fixes = buildSceneView(plan, size, plan.timeline.scenes[3]!);
    expect(fixes.fixText).toBe('+ 2 bug fixes');
  });

  it.each(BUILTIN_TEMPLATES)('renders an escaped, self-contained scene document with %s', (template) => {
    const plan = buildPlan(release, { ...config, template });
    const html = renderSceneDocument(plan, config.sizes[0]!, 1, { assetBase: '/template/' });
    expect(html).toContain('Tom &amp; Jerry &quot;mode&quot;');
    expect(html).not.toContain('Jerry "mode"');
    expect(html).toContain('__shipreelSeek');
    expect(html).toContain('href="/template/styles.css"');
    expect(html).toContain('fonts.googleapis.com/css2?family=');
    expect(html).toMatch(/--duration:\d+(\.\d{1,3})?s;/);
    expect(html).not.toMatch(/\{\{\{?[#^/]?\s*[\w.]+\s*\}\}/);
  });

  it('skips Google Fonts for system fonts', () => {
    const plan = buildPlan(release, { ...config, font: 'system-ui' });
    expect(renderSceneDocument(plan, config.sizes[0]!, 0, { assetBase: '/t/' })).not.toContain('fonts.googleapis.com');
  });

  it('names output files by project, version and size', () => {
    const plan = buildPlan(release, { ...config, name: '@acme/UI kit' });
    expect(videoFileName(plan, config.sizes[0]!)).toBe('acme-ui-kit-v2.4.0-square.mp4');
  });
});

describe('helpers', () => {
  it('picks readable text colors', () => {
    expect(contrastColor('#000000')).toBe('#ffffff');
    expect(contrastColor('#ffffff')).toBe('#0b0b0f');
    expect(contrastColor('#fe0')).toBe('#0b0b0f');
    expect(contrastColor('#6d28d9')).toBe('#ffffff');
  });

  it('builds social-media friendly ffmpeg arguments', () => {
    const args = encoderArgs({ file: 'out.mp4', fps: 30, durationSeconds: 20 });
    expect(args).toEqual(expect.arrayContaining(['libx264', 'yuv420p', '+faststart']));
    expect(args).not.toContain('aac');
    const withMusic = encoderArgs({ file: 'out.mp4', fps: 30, durationSeconds: 20, music: 'song.mp3' });
    expect(withMusic).toEqual(expect.arrayContaining(['-stream_loop', 'song.mp3', 'aac', '20.000']));
    expect(withMusic.join(' ')).toContain('afade=t=out:st=18.50');
  });

  it('scales GIFs by their longest side and drops audio', () => {
    const landscape = gifArgs('a.mp4', 'a.gif', { width: 1920, height: 1080 });
    expect(landscape.join(' ')).toContain('fps=15,scale=720:-2:flags=lanczos');
    expect(landscape).toEqual(expect.arrayContaining(['-loop', '0', '-an']));
    expect(gifArgs('a.mp4', 'a.gif', { width: 1080, height: 1920 }).join(' ')).toContain('scale=-2:720');
    expect(gifArgs('a.mp4', 'a.gif', { width: 320, height: 180 }).join(' ')).toContain('scale=320:-2');
  });

  it('takes the poster before the intro fades out', () => {
    // 2s intro at 30 fps: the fade-out starts at frame 50, the poster is frame 47.
    expect(posterFrame(60, 30)).toBe(47);
    expect(posterFrame(3, 30)).toBe(0);
  });

  it('names posters and GIFs after their video', () => {
    expect(siblingFile('/out/acme-v1.2.0-square.mp4', '.png')).toBe('/out/acme-v1.2.0-square.png');
    expect(siblingFile('/out/acme-v1.2.0-square.mp4', '.gif')).toBe('/out/acme-v1.2.0-square.gif');
  });
});
