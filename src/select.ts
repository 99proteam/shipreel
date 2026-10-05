import type { Highlight, ParsedRelease, ReleaseItem, VideoContent } from './types.js';

export interface CleanOptions {
  /** Maximum characters for a highlight line. Longer lines are shortened at a word boundary. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 72;

/**
 * Turn a raw changelog bullet into a short, human sentence:
 * strips PR/issue links, commit hashes, author mentions, conventional prefixes and
 * markdown, then shortens long lines.
 */
export function cleanItem(raw: string, options: CleanOptions = {}): string {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  let text = raw;

  // GitHub auto-generated notes: "feat: thing by @user in https://github.com/o/r/pull/12"
  text = text.replace(/\s+by\s+@[\w-]+(?:\[bot\])?(?:\s+in\s+\S+)?/gi, '');
  text = text.replace(/\s+in\s+https?:\/\/\S+/gi, '');

  // Closing keywords pointing at an issue link: ", closes [#330](...)".
  text = text.replace(/,?\s*\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+\[#\d+\]\([^)]*\)/gi, '');
  // Links to PRs, issues, commits and compares: ([#123](...)), ([abc1234](...)), [#12](...)
  text = text.replace(/\(\s*\[[^\]]*\]\(https?:\/\/[^)]*\)(?:\s*,\s*\[[^\]]*\]\(https?:\/\/[^)]*\))*\s*\)/g, (match) =>
    /\[(?:#?\d+|[0-9a-f]{7,40}|[\w-]+\/[\w.-]+#\d+)\]/i.test(match) ? '' : match,
  );
  text = text.replace(/\[(?:#\d+|[0-9a-f]{7,40}|[\w-]+\/[\w.-]+#\d+)\]\([^)]*\)/gi, '');
  // Remaining markdown links and images keep their label.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/<https?:\/\/[^>]+>/g, '');
  text = text.replace(/https?:\/\/\S+/g, '');

  // Changesets: "abc1234: Added foo" / "#123 abc1234 Thanks @user! - Added foo"
  text = text.replace(/^(?:\[?#\d+\]?\s+)?(?:\[?[0-9a-f]{7,40}\]?\s*)?(?:Thanks\s+@[\w-]+!?\s*)?-\s+(?=\S)/i, '');
  text = text.replace(/^[0-9a-f]{7,40}:\s*/i, '');

  // Issue references and closing keywords.
  text = text.replace(/\(\s*(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s+)?(?:[\w-]+\/[\w.-]+)?#\d+(?:\s*,\s*#\d+)*\s*\)/gi, '');
  text = text.replace(/,?\s*\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+/gi, '');
  text = text.replace(/(^|\s)#\d+\b/g, '$1');
  text = text.replace(/\bGH-\d+\b/g, '');

  // Commit hashes (must contain a digit and a letter to avoid eating words like "deadbeef").
  text = text.replace(/\(?\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b\)?/g, '');

  // Author mentions: "(@user)", "by @user", "thanks @user", "@user" (but keep npm scopes like @types/node).
  text = text.replace(/\(\s*(?:by\s+|thanks\s+)?@[\w-]+(?:\s*,\s*@[\w-]+)*\s*\)/gi, '');
  text = text.replace(/\s*(?:[-–—,]\s*)?(?:by|thanks(?: to)?|from|via|cc)\s+@[\w-]+(?:\s*(?:,|and)\s*@[\w-]+)*!?/gi, '');
  text = text.replace(/(^|\s)@[\w-]+(?![\w/@-])/g, '$1');

  // Conventional commit prefix and bold scopes: "feat(parser)!: ", "**parser:** ".
  text = text.replace(/^(?:\*\*|__)?[a-z]+(?:\([^)]*\))?!?:(?:\*\*|__)?\s+/i, '');
  text = text.replace(/^(?:\*\*|__)[^*_]{1,40}?:(?:\*\*|__)\s+/, '');
  text = text.replace(/^breaking(?: changes?)?:\s*/i, '');

  // Markdown emphasis, inline code, emoji shortcodes, HTML tags. A leading code span is
  // remembered so identifiers like `useToast()` are not capitalized.
  const startsWithCode = /^`/.test(text);
  text = text.replace(/<\/?[a-z][^>]*>/gi, '');
  text = text.replace(/(\*\*|__)(.+?)\1/g, '$2');
  text = text.replace(/(^|[\s(])[*_](\S(?:.*?\S)?)[*_](?=[\s).,!?:;]|$)/g, '$1$2');
  text = text.replace(/`([^`]*)`/g, '$1');
  text = text.replace(/:[a-z0-9_+-]+:/g, '');

  // Tidy punctuation and whitespace.
  text = text
    .replace(/(^|\s)\(\s*\)|\[\s*\]/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[-–—:,;.\s]+/, '')
    .replace(/[\s,;:–—-]+$/, '')
    .replace(/\.$/, '')
    .trim();

  if (!text) return '';
  // Leading emoji are dropped: they render inconsistently across systems.
  text = text.replace(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, '');
  const firstWord = text.split(/\s/)[0] ?? '';
  if (!startsWithCode && /^[a-z][a-z'-]*$/.test(firstWord)) text = text.charAt(0).toUpperCase() + text.slice(1);
  return shorten(text, maxChars);
}

/** Shorten text to `maxChars`, preferring clause boundaries, then word boundaries. */
export function shorten(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const window = text.slice(0, maxChars);
  const minClause = Math.floor(maxChars * 0.45);
  for (const separator of [' — ', ' – ', ' - ', '; ', ': ', ' (', ', ']) {
    const at = window.lastIndexOf(separator);
    if (at >= minClause) return window.slice(0, at).replace(/[\s,;:]+$/, '');
  }
  const space = window.slice(0, maxChars - 1).lastIndexOf(' ');
  const cut = space > minClause ? window.slice(0, space) : window.slice(0, maxChars - 1);
  return `${cut.replace(/[\s,;:.–—-]+$/, '')}…`;
}

export interface SelectOptions extends CleanOptions {
  /** Maximum number of highlight scenes. Default 5. */
  maxItems?: number;
}

const PRIORITY: Highlight['kind'][] = ['feature', 'performance', 'breaking', 'other'];

/**
 * Pick the highlights for the video: features first, then performance, breaking changes
 * and other changes. Fixes are summarized as a count unless nothing else is available.
 */
export function selectHighlights(
  release: ParsedRelease,
  options: SelectOptions = {},
): Pick<VideoContent, 'highlights' | 'fixCount' | 'highlightsAreFixes'> {
  const maxItems = Math.max(1, options.maxItems ?? 5);
  const seen = new Set<string>();
  const cleaned: Array<{ item: ReleaseItem; text: string }> = [];

  for (const item of release.items) {
    if (item.kind === 'ignored') continue;
    const text = cleanItem(item.raw, options);
    const key = text.toLowerCase();
    if (!text || text.length < 3 || seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ item, text });
  }

  const fixes = cleaned.filter((c) => c.item.kind === 'fix');
  const highlights: Highlight[] = [];
  for (const kind of PRIORITY) {
    for (const c of cleaned) {
      if (highlights.length >= maxItems) break;
      if (c.item.kind === kind) highlights.push({ kind, text: c.text });
    }
  }

  if (highlights.length === 0 && fixes.length > 0) {
    const shown = fixes.slice(0, maxItems).map((c) => ({ kind: 'fix' as const, text: c.text }));
    return { highlights: shown, fixCount: fixes.length - shown.length, highlightsAreFixes: true };
  }

  return { highlights, fixCount: fixes.length, highlightsAreFixes: false };
}
