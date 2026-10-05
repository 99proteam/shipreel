import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifySection,
  extractDate,
  findRelease,
  normalizeVersion,
  parseChangelog,
  parseReleaseNotes,
} from '../src/parse/changelog.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind);

describe('Keep a Changelog', () => {
  const md = fixture('keep-a-changelog.md');

  it('finds every release including Unreleased', () => {
    expect(parseChangelog(md).map((r) => r.version)).toEqual(['Unreleased', '2.4.0', '2.3.1', '2.3.0']);
  });

  it('picks the latest released version by default', () => {
    const release = findRelease(md)!;
    expect(release.version).toBe('2.4.0');
    expect(release.date).toBe('2026-09-30');
  });

  it('groups items by section', () => {
    const release = findRelease(md, '2.4.0')!;
    expect(kinds(release.items)).toEqual([
      'feature', 'feature', 'feature', 'feature',
      'other', 'other',
      'fix', 'fix', 'fix', 'fix', 'fix', 'fix',
      'fix',
    ]);
  });

  it('joins wrapped bullet lines', () => {
    const release = findRelease(md, 'v2.4.0')!;
    expect(release.items[2]!.raw).toContain('generated from a single brand color so themes stay consistent');
  });

  it('maps Removed to breaking', () => {
    const release = findRelease(md, '2.3.0')!;
    expect(release.items.map((i) => [i.kind, i.breaking])).toEqual([
      ['feature', false],
      ['breaking', true],
    ]);
  });

  it('returns undefined for unknown versions', () => {
    expect(findRelease(md, '9.9.9')).toBeUndefined();
  });
});

describe('conventional-changelog', () => {
  const md = fixture('conventional-changelog.md');

  it('handles linked headings at mixed levels (## minor, ### patch, # major)', () => {
    const releases = parseChangelog(md);
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ['3.2.0', '2026-09-12'],
      ['3.1.2', '2026-08-20'],
      ['3.0.0', '2026-06-01'],
    ]);
  });

  it('classifies Features / Bug Fixes / Performance Improvements', () => {
    expect(kinds(findRelease(md, '3.2.0')!.items)).toEqual(['feature', 'feature', 'feature', 'fix', 'fix', 'fix', 'performance']);
  });

  it('marks BREAKING CHANGES', () => {
    const items = findRelease(md, '3.0.0')!.items;
    expect(items.at(-1)).toMatchObject({ kind: 'breaking', breaking: true });
  });
});

describe('release-please', () => {
  it('reads the ⚠ BREAKING CHANGES section and ignores Documentation', () => {
    const release = findRelease(fixture('release-please.md'))!;
    expect(release.version).toBe('4.0.0');
    expect(kinds(release.items)).toEqual(['breaking', 'feature', 'feature', 'fix', 'ignored']);
  });
});

describe('changesets', () => {
  it('maps Minor Changes to features and Patch Changes to fixes, skipping nested and dependency bullets', () => {
    const release = findRelease(fixture('changesets.md'))!;
    expect(release.version).toBe('5.1.0');
    expect(kinds(release.items)).toEqual(['feature', 'feature', 'fix', 'ignored']);
  });
});

describe('GitHub release body', () => {
  const md = fixture('github-release-notes.md');

  it('treats a document without version headings as the given release', () => {
    const release = parseReleaseNotes(md, 'v1.8.0', '2026-10-01');
    expect(release.version).toBe('1.8.0');
    expect(release.date).toBe('2026-10-01');
    expect(kinds(release.items)).toEqual(['feature', 'feature', 'feature', 'fix', 'fix', 'ignored', 'ignored', 'ignored']);
  });

  it('flags `feat!:` as breaking', () => {
    const release = parseReleaseNotes(md, '1.8.0');
    expect(release.items[1]).toMatchObject({ kind: 'feature', breaking: true });
  });

  it('uses conventional prefixes inside generic sections', () => {
    const release = parseReleaseNotes(
      "## What's Changed\n* feat: new thing\n* fix: broken thing\n* perf: faster thing\n* chore: tidy\n* Something else",
      '1.0.0',
    );
    expect(kinds(release.items)).toEqual(['feature', 'fix', 'performance', 'ignored', 'other']);
  });
});

describe('plain markdown notes', () => {
  it('reads emoji section headings', () => {
    const release = parseReleaseNotes(fixture('plain-notes.md'), '0.9.0');
    expect(kinds(release.items)).toEqual(['feature', 'feature', 'feature', 'fix', 'fix', 'ignored']);
  });

  it('ignores bullets inside code blocks', () => {
    const release = parseReleaseNotes('## Features\n- real\n```\n- not a bullet\n```\n', '1.0.0');
    expect(release.items).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('normalizes versions and tags', () => {
    expect(normalizeVersion('v2.4.0')).toBe('2.4.0');
    expect(normalizeVersion('@scope/pkg@1.2.3-beta.1')).toBe('1.2.3-beta.1');
    expect(normalizeVersion('release-3.0.0')).toBe('3.0.0');
  });

  it('extracts dates in common formats', () => {
    expect(extractDate('[1.0.0] - 2024-3-7')).toBe('2024-03-07');
    expect(extractDate('1.0.0 (2024/12/31)')).toBe('2024-12-31');
    expect(extractDate('v1.0.0 — March 3, 2024')).toBe('2024-03-03');
    expect(extractDate('v1.0.0 - 3 March 2024')).toBe('2024-03-03');
    expect(extractDate('no date')).toBeUndefined();
  });

  it('classifies section headings', () => {
    expect(classifySection('🚀 Features').kind).toBe('feature');
    expect(classifySection('Bug Fixes').kind).toBe('fix');
    expect(classifySection('⚡ Performance Improvements').kind).toBe('performance');
    expect(classifySection('⚠ BREAKING CHANGES').kind).toBe('breaking');
    expect(classifySection('Documentation').kind).toBe('ignored');
    expect(classifySection("What's Changed")).toEqual({ kind: 'other', generic: true });
  });

  it('accepts package-prefixed and "Version" headings', () => {
    const releases = parseChangelog('## @acme/pkg@1.2.0\n- a\n## Version 1.1.0\n- b\n## v1.0.0 (2020-01-01)\n- c');
    expect(releases.map((r) => r.version)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
  });
});
