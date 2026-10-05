/** Category of a single changelog entry. `ignored` covers docs/chore/ci/etc. */
export type ItemKind = 'feature' | 'fix' | 'performance' | 'breaking' | 'other' | 'ignored';

export interface ReleaseItem {
  kind: ItemKind;
  /** Raw bullet text as it appeared in the source (without the bullet marker). */
  raw: string;
  /** True when the entry is flagged as a breaking change (`feat!:`, BREAKING section...). */
  breaking: boolean;
}

export interface ParsedRelease {
  version: string;
  /** ISO date (YYYY-MM-DD) when known. */
  date?: string;
  /** Free-form title found in the heading, if any. */
  title?: string;
  items: ReleaseItem[];
}

export interface Highlight {
  kind: Exclude<ItemKind, 'ignored'>;
  text: string;
}

export interface VideoContent {
  projectName: string;
  version: string;
  date?: string;
  highlights: Highlight[];
  /** Number of fixes not shown as highlights. */
  fixCount: number;
  /** True when highlights were taken from fixes because nothing else was available. */
  highlightsAreFixes: boolean;
}

export type SceneType = 'intro' | 'highlight' | 'fixes' | 'outro';

export interface SizeSpec {
  name: string;
  width: number;
  height: number;
}
