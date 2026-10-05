import type { ItemKind, ParsedRelease, ReleaseItem } from '../types.js';

const SEMVER = String.raw`v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)`;

/**
 * A heading is a release heading when it starts with a version, optionally wrapped in
 * `[...]` and optionally prefixed by "Release", "Version" or a package name
 * (`pkg@1.2.0`, `my-lib v1.2.0`).
 */
const VERSION_HEADING = new RegExp(
  String.raw`^\[?\s*(?:(?:release|version)\s+|[\w.@/-]+?(?:@|\s+))?\[?` + SEMVER + String.raw`\]?(?=$|[\s\]()\-–—:,/])`,
  'i',
);
const UNRELEASED_HEADING = /^\[?\s*unreleased\s*\]?/i;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_PATTERNS: RegExp[] = [
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
  new RegExp(String.raw`\b((?:${MONTHS})[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b`, 'i'),
  new RegExp(String.raw`\b(\d{1,2}\s+(?:${MONTHS})[a-z]*\.?,?\s+\d{4})\b`, 'i'),
];

interface SectionInfo {
  kind: ItemKind;
  /** Generic sections ("What's Changed", "Changes") let conventional prefixes decide the kind. */
  generic: boolean;
}

export function normalizeVersion(version: string): string {
  // Accept tags such as "v2.4.0", "my-pkg@2.4.0" and "release-2.4.0".
  const match = new RegExp(SEMVER).exec(version.trim());
  return match?.[1] ?? version.trim().replace(/^v/i, '');
}

export function extractDate(text: string): string | undefined {
  for (const [index, pattern] of DATE_PATTERNS.entries()) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (index < 3) {
      const [, y, m, d] = match;
      return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }
    const parsed = new Date(`${match[1]!.replace(/(\d)(st|nd|rd|th)/, '$1')} UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return undefined;
}

export function classifySection(heading: string): SectionInfo {
  const h = heading
    .toLowerCase()
    .replace(/:[a-z_]+:/g, ' ') // :sparkles: shortcodes
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/breaking|major changes|^removed$|^removals?$/.test(h)) return { kind: 'breaking', generic: false };
  if (/perf|performance|speed/.test(h)) return { kind: 'performance', generic: false };
  if (/\bfix|bug|patch changes|security|hotfix/.test(h)) return { kind: 'fix', generic: false };
  if (/feature|^added$|^add$|minor changes|enhancement|what's new|^new$|^highlights?$|^new stuff$/.test(h)) {
    return { kind: 'feature', generic: false };
  }
  if (
    /docs?|documentation|chore|refactor|tests?|testing|build|^ci$|continuous integration|dependenc|deps|maintenance|internal|contributors?|misc|revert|style|tooling|infra/.test(
      h,
    )
  ) {
    return { kind: 'ignored', generic: false };
  }
  return { kind: 'other', generic: true };
}

const PREFIX = /^(?:\*\*|__)?([a-z]+)(?:\(([^)]*)\))?(!)?:(?:\*\*|__)?\s+/i;
const PREFIX_KINDS: Record<string, ItemKind> = {
  feat: 'feature',
  feature: 'feature',
  features: 'feature',
  add: 'feature',
  fix: 'fix',
  fixes: 'fix',
  bugfix: 'fix',
  hotfix: 'fix',
  security: 'fix',
  perf: 'performance',
  docs: 'ignored',
  doc: 'ignored',
  chore: 'ignored',
  ci: 'ignored',
  test: 'ignored',
  tests: 'ignored',
  build: 'ignored',
  refactor: 'ignored',
  style: 'ignored',
  revert: 'ignored',
  deps: 'ignored',
  release: 'ignored',
};

function classifyItem(raw: string, section: SectionInfo): ReleaseItem {
  let kind: ItemKind = section.kind;
  let breaking = section.kind === 'breaking';
  const prefix = PREFIX.exec(raw);
  if (prefix) {
    const prefixKind = PREFIX_KINDS[prefix[1]!.toLowerCase()];
    if (prefix[3] === '!') breaking = true;
    if (prefixKind && section.generic) kind = prefixKind;
  }
  if (/^\*{0,2}breaking( change)?s?\*{0,2}:/i.test(raw)) breaking = true;
  if (/^updated? dependencies\b/i.test(raw)) kind = 'ignored';
  if (section.generic && (/^bump\s/i.test(raw) || /\b(dependabot|renovate)(\[bot\])?\b/i.test(raw))) {
    kind = 'ignored';
  }
  if (breaking && kind === 'other') kind = 'breaking';
  return { kind, raw, breaking };
}

interface MutableRelease extends ParsedRelease {
  sectionInfo: SectionInfo;
  baseIndent: number | undefined;
  lastItem: ReleaseItem | undefined;
}

function newRelease(version: string, headingText: string): MutableRelease {
  const date = extractDate(headingText);
  return {
    version,
    ...(date ? { date } : {}),
    title: headingText,
    items: [],
    sectionInfo: { kind: 'other', generic: true },
    baseIndent: undefined,
    lastItem: undefined,
  };
}

function finalize(release: MutableRelease): ParsedRelease {
  const { version, date, title, items } = release;
  return { version, ...(date ? { date } : {}), ...(title ? { title } : {}), items };
}

export interface ParsedDocument {
  /** Releases introduced by a version heading, in document order (newest first in most changelogs). */
  releases: ParsedRelease[];
  /** Items that appear before any version heading (e.g. GitHub release bodies). */
  preamble: ParsedRelease;
}

/** Parse a markdown document into releases (Keep a Changelog, conventional-changelog, changesets...). */
export function parseMarkdown(markdown: string): ParsedDocument {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const preamble = newRelease('', '');
  preamble.title = undefined;
  const releases: MutableRelease[] = [];
  let current = preamble;
  let inCodeBlock = false;
  let previousWasBullet = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      previousWasBullet = false;
      continue;
    }
    if (inCodeBlock) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const text = heading[2]!.trim();
      const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
      const version = VERSION_HEADING.exec(plain);
      if (version) {
        current = newRelease(version[1]!, plain);
        releases.push(current);
      } else if (UNRELEASED_HEADING.test(plain)) {
        current = newRelease('Unreleased', plain);
        releases.push(current);
      } else {
        current.sectionInfo = classifySection(plain);
        current.baseIndent = undefined;
      }
      current.lastItem = undefined;
      previousWasBullet = false;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      const indent = bullet[1]!.replace(/\t/g, '    ').length;
      if (current.baseIndent === undefined) current.baseIndent = indent;
      if (indent > current.baseIndent + 1) {
        // Nested bullet: details of the parent entry, not a highlight of its own.
        previousWasBullet = true;
        continue;
      }
      const text = bullet[2]!.trim();
      if (!text) continue;
      const item = classifyItem(text, current.sectionInfo);
      current.items.push(item);
      current.lastItem = item;
      previousWasBullet = true;
      continue;
    }

    if (!line.trim()) {
      previousWasBullet = false;
      continue;
    }

    // Wrapped bullet text continues on the next line.
    if (previousWasBullet && current.lastItem && !/^\s*[>|]/.test(line)) {
      current.lastItem.raw = `${current.lastItem.raw} ${line.trim()}`;
    }
  }

  return { releases: releases.map(finalize), preamble: finalize(preamble) };
}

/** Parse a CHANGELOG.md and return all releases found, newest first (document order). */
export function parseChangelog(markdown: string): ParsedRelease[] {
  return parseMarkdown(markdown).releases;
}

/**
 * Find one release in a changelog. Without a version, returns the first released entry
 * (skipping "Unreleased").
 */
export function findRelease(markdown: string, version?: string): ParsedRelease | undefined {
  const releases = parseChangelog(markdown);
  if (!version) return releases.find((r) => r.version !== 'Unreleased' && r.items.length > 0) ?? releases[0];
  const wanted = normalizeVersion(version);
  return releases.find((r) => r.version === wanted || normalizeVersion(r.version) === wanted);
}

/**
 * Parse release notes (a GitHub release body or any markdown file). If the document
 * contains version headings, the matching release is used; otherwise the whole
 * document is treated as the notes of `version`.
 */
export function parseReleaseNotes(markdown: string, version: string, date?: string): ParsedRelease {
  const doc = parseMarkdown(markdown);
  const wanted = normalizeVersion(version);
  const match = doc.releases.find((r) => normalizeVersion(r.version) === wanted);
  const base = match && match.items.length > 0 ? match : doc.preamble.items.length > 0 ? doc.preamble : match;
  const items = base?.items ?? [];
  const resolvedDate = date ?? base?.date;
  return { version: wanted, ...(resolvedDate ? { date: resolvedDate } : {}), items };
}
