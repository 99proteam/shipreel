import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRelease, parseReleaseNotes } from '../src/parse/changelog.js';
import { cleanItem, selectHighlights, shorten } from '../src/select.js';
import type { ParsedRelease, ReleaseItem } from '../src/types.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const item = (kind: ReleaseItem['kind'], raw: string): ReleaseItem => ({ kind, raw, breaking: false });

describe('cleanItem', () => {
  it.each([
    ['**cli:** add `--watch` mode ([#341](https://github.com/o/r/issues/341)) ([4f2a9c1](https://github.com/o/r/commit/4f2a9c1))', 'Add --watch mode'],
    ['feat: add S3 adapter by @marta-dev in https://github.com/o/r/pull/221', 'Add S3 adapter'],
    ['fix(api)!: rename options (#230)', 'Rename options'],
    ['Fixed memory leak in `Popover`. (abc1234)', 'Fixed memory leak in Popover'],
    ['RTL support for `Tabs` by @lena-k', 'RTL support for Tabs'],
    ['3f2a1b9: Add collaborative cursors', 'Add collaborative cursors'],
    ['[#1204](https://x/pull/1204) [`8d7e6f5`](https://x/commit/8d7e6f5) Thanks [@sora](https://github.com/sora)! - Markdown shortcuts', 'Markdown shortcuts'],
    ['graceful shutdown, closes [#330](https://github.com/o/r/issues/330) ([e1f2a3b](https://x))', 'Graceful shutdown'],
    ['Source maps fixed (fixes #77)', 'Source maps fixed'],
    ['4x faster rebuilds — thanks @devon!', '4x faster rebuilds'],
    ['Support [Bun](https://bun.sh) runtime', 'Support Bun runtime'],
    [':sparkles: New theme', 'New theme'],
    ['🚀 Rocket mode', 'Rocket mode'],
    ['**Plugin API**: extend the bundler', 'Plugin API: extend the bundler'],
  ])('%s', (raw, expected) => {
    expect(cleanItem(raw)).toBe(expected);
  });

  it('keeps code identifiers and npm scopes intact', () => {
    expect(cleanItem('`useToast()` hook')).toBe('useToast() hook');
    expect(cleanItem('remove `login()` in favor of `signIn()`')).toBe('Remove login() in favor of signIn()');
    expect(cleanItem('upgrade @types/node to v22')).toBe('Upgrade @types/node to v22');
  });

  it('shortens long lines', () => {
    const long = 'Automatic reconnection with exponential backoff and offline queue so clients never lose events';
    const cleaned = cleanItem(long, { maxChars: 50 });
    expect(cleaned.length).toBeLessThanOrEqual(50);
    expect(cleaned.endsWith('…')).toBe(true);
  });
});

describe('shorten', () => {
  it('prefers clause boundaries', () => {
    expect(shorten('Dark mode tokens for every component, generated from a single brand color', 50)).toBe('Dark mode tokens for every component');
  });
  it('cuts at the first colon so no dangling words remain', () => {
    expect(shorten('GitHub Action that attaches videos to every published release: uses: 99proteam/shipreel@v1', 72)).toBe(
      'GitHub Action that attaches videos to every published release',
    );
  });
  it('cuts at a word boundary with an ellipsis', () => {
    const out = shorten('one two three four five six seven eight nine ten eleven twelve', 30);
    expect(out).toBe('one two three four five six…');
  });
  it('leaves short text untouched', () => {
    expect(shorten('short', 30)).toBe('short');
  });
});

describe('selectHighlights', () => {
  it('puts features first, then performance, breaking and other; counts fixes', () => {
    const release: ParsedRelease = {
      version: '1.0.0',
      items: [
        item('fix', 'fix a'),
        item('other', 'changed b'),
        item('performance', 'faster c'),
        item('feature', 'feature d'),
        item('breaking', 'breaking e'),
        item('feature', 'feature f'),
        item('ignored', 'docs g'),
        item('fix', 'fix h'),
      ],
    };
    const result = selectHighlights(release, { maxItems: 4 });
    expect(result.highlights.map((h) => h.text)).toEqual(['Feature d', 'Feature f', 'Faster c', 'Breaking e']);
    expect(result.fixCount).toBe(2);
    expect(result.highlightsAreFixes).toBe(false);
  });

  it('caps at 5 items by default and dedupes', () => {
    const items = Array.from({ length: 8 }, (_, i) => item('feature', `feature ${i % 6}`));
    const result = selectHighlights({ version: '1', items });
    expect(result.highlights).toHaveLength(5);
    expect(new Set(result.highlights.map((h) => h.text)).size).toBe(5);
  });

  it('falls back to fixes when there is nothing else', () => {
    const release: ParsedRelease = { version: '1.0.1', items: [item('fix', 'a fix'), item('fix', 'b fix'), item('fix', 'c fix')] };
    const result = selectHighlights(release, { maxItems: 2 });
    expect(result.highlights.map((h) => h.kind)).toEqual(['fix', 'fix']);
    expect(result.fixCount).toBe(1);
    expect(result.highlightsAreFixes).toBe(true);
  });

  it('produces clean highlights from real changelogs', () => {
    const conventional = selectHighlights(findRelease(fixture('conventional-changelog.md'))!);
    expect(conventional.highlights.map((h) => h.text)).toEqual([
      'Add --watch mode that re-runs jobs on file changes',
      'Support priority lanes with weighted fair scheduling',
      'Graceful shutdown waits for in-flight jobs',
      'Batch acknowledgements to cut Redis round-trips by 60%',
    ]);
    expect(conventional.fixCount).toBe(3);

    const github = selectHighlights(parseReleaseNotes(fixture('github-release-notes.md'), '1.8.0'));
    expect(github.highlights.map((h) => h.text)).toEqual([
      'Add S3-compatible storage adapter',
      'Rename upload() options to camelCase',
      'Resumable uploads for files larger than 5 GB with automatic chunk retry',
    ]);
    expect(github.fixCount).toBe(2);
  });
});
