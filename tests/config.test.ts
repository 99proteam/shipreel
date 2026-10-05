import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseSize, parseSizes, repoFromUrl } from '../src/config.js';

function project(files: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'shipreel-config-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('loadConfig', () => {
  it('uses defaults when nothing is configured', () => {
    const cwd = project({});
    const config = loadConfig({ cwd });
    expect(config.template).toBe('minimal');
    expect(config.sizes.map((s) => s.name)).toEqual(['landscape', 'square', 'vertical']);
    expect(config.maxItems).toBe(5);
    expect(config.fps).toBe(30);
    expect(config.ctaSecondary).toBe('Star us on GitHub');
    expect(config.outDir).toBe(path.join(cwd, 'videos'));
    expect(config.source).toBe('defaults');
  });

  it('reads shipreel.config.json and resolves paths relative to it', () => {
    const cwd = project({
      'shipreel.config.json': { template: 'terminal', brandColor: '#ff0066', logo: 'assets/logo.svg', sizes: ['square'], maxItems: 3, cta: 'Try it' },
    });
    const config = loadConfig({ cwd });
    expect(config).toMatchObject({ template: 'terminal', brandColor: '#ff0066', maxItems: 3, cta: 'Try it' });
    expect(config.logo).toBe(path.join(cwd, 'assets/logo.svg'));
    expect(config.sizes).toEqual([{ name: 'square', width: 1080, height: 1080 }]);
  });

  it('falls back to the "shipreel" key in package.json and derives name, repo and cta', () => {
    const cwd = project({
      'package.json': { name: 'cool-lib', repository: { url: 'git+https://github.com/me/cool-lib.git' }, shipreel: { template: 'bold' } },
    });
    const config = loadConfig({ cwd });
    expect(config).toMatchObject({ template: 'bold', name: 'cool-lib', repo: 'me/cool-lib', cta: 'npm i cool-lib@latest' });
  });

  it('does not suggest npm install for private packages', () => {
    const cwd = project({ 'package.json': { name: 'app', private: true, homepage: 'https://app.dev' } });
    expect(loadConfig({ cwd }).cta).toBe('app.dev');
  });

  it('lets overrides win and ignores undefined overrides', () => {
    const cwd = project({ 'shipreel.config.json': { template: 'terminal', fps: 24 } });
    const config = loadConfig({ cwd, overrides: { template: 'bold', fps: undefined, sizes: 'vertical,1280x720' } });
    expect(config.template).toBe('bold');
    expect(config.fps).toBe(24);
    expect(config.sizes.map((s) => s.name)).toEqual(['vertical', '1280x720']);
  });

  it('resolves custom template paths', () => {
    const cwd = project({ 'shipreel.config.json': { template: './my-template' } });
    expect(loadConfig({ cwd }).template).toBe(path.join(cwd, 'my-template'));
  });

  it('reads an explicit config path', () => {
    const cwd = project({ '.github/video.json': { template: 'terminal', logo: 'logo.png' } });
    const config = loadConfig({ cwd, configPath: '.github/video.json' });
    expect(config.template).toBe('terminal');
    expect(config.logo).toBe(path.join(cwd, '.github', 'logo.png'));
  });

  it('reports invalid values clearly', () => {
    const cwd = project({ 'shipreel.config.json': { brandColor: 'purple', maxItems: 50, colour: 'x' } });
    expect(() => loadConfig({ cwd })).toThrow(ConfigError);
    try {
      loadConfig({ cwd });
    } catch (error) {
      expect((error as Error).message).toMatch(/brandColor/);
      expect((error as Error).message).toMatch(/maxItems/);
      expect((error as Error).message).toMatch(/unknown key\(s\): colour/);
    }
  });

  it('errors on a missing explicit config and on broken JSON', () => {
    const cwd = project({ 'shipreel.config.json': '{ nope' });
    expect(() => loadConfig({ cwd })).toThrow(/Could not parse/);
    expect(() => loadConfig({ cwd, configPath: 'missing.json' })).toThrow(/not found/);
  });
});

describe('sizes', () => {
  it('parses presets and custom sizes', () => {
    expect(parseSize('Landscape')).toEqual({ name: 'landscape', width: 1920, height: 1080 });
    expect(parseSize('1280x720')).toEqual({ name: '1280x720', width: 1280, height: 720 });
  });
  it('rejects odd or unknown sizes', () => {
    expect(() => parseSize('1281x720')).toThrow(/even/);
    expect(() => parseSize('portrait')).toThrow(/Unknown size/);
  });
  it('dedupes lists', () => {
    expect(parseSizes('square, square,vertical').map((s) => s.name)).toEqual(['square', 'vertical']);
  });
});

describe('repoFromUrl', () => {
  it.each([
    ['https://github.com/a/b', 'a/b'],
    ['git+https://github.com/a/b.git', 'a/b'],
    ['git@github.com:a/b.git', 'a/b'],
    ['github:a/b', 'a/b'],
    ['a/b', 'a/b'],
  ])('%s', (url, repo) => expect(repoFromUrl(url)).toBe(repo));
});
