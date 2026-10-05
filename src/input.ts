import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findRelease, normalizeVersion, parseChangelog, parseMarkdown, parseReleaseNotes } from './parse/changelog.js';
import { fetchRelease, type GitHubRelease } from './github.js';
import type { ParsedRelease } from './types.js';

export interface LoadReleaseOptions {
  cwd?: string;
  /** Path to a CHANGELOG.md (Keep a Changelog, conventional-changelog, changesets...). */
  changelog?: string;
  /** Path to a plain markdown release notes file. */
  notes?: string;
  /** Version to pick from the changelog (default: latest released entry). */
  version?: string;
  /** GitHub release tag to fetch ("latest" for the latest release). */
  release?: string;
  /** GitHub repository "owner/name" (required with `release`). */
  repo?: string;
  token?: string;
}

export interface LoadedRelease {
  release: ParsedRelease;
  /** Where the notes came from, for logs. */
  source: string;
  githubRelease?: GitHubRelease;
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

function read(file: string): string {
  if (!existsSync(file)) throw new InputError(`File not found: ${file}`);
  return readFileSync(file, 'utf8');
}

/** Convert a GitHub release into a parsed release. */
export function releaseFromGitHub(gh: Pick<GitHubRelease, 'tag_name' | 'body' | 'published_at' | 'created_at'>): ParsedRelease {
  const date = (gh.published_at ?? gh.created_at)?.slice(0, 10);
  return parseReleaseNotes(gh.body ?? '', normalizeVersion(gh.tag_name), date);
}

/** Load release notes from a local changelog or markdown file (synchronous). */
export function loadLocalRelease(options: Omit<LoadReleaseOptions, 'release' | 'repo' | 'token'>): LoadedRelease {
  const cwd = options.cwd ?? process.cwd();

  if (options.notes) {
    const file = path.resolve(cwd, options.notes);
    const markdown = read(file);
    let version = options.version;
    if (!version) {
      version = parseMarkdown(markdown).releases.find((r) => r.version !== 'Unreleased')?.version;
      if (!version) throw new InputError('--version is required when the notes file has no version heading');
    }
    return { release: parseReleaseNotes(markdown, version), source: file };
  }

  const changelog = options.changelog ? path.resolve(cwd, options.changelog) : path.resolve(cwd, 'CHANGELOG.md');
  if (!options.changelog && !existsSync(changelog)) {
    throw new InputError('No input given. Use --changelog <file>, --notes <file> or --release <tag> --repo <owner/name>.');
  }
  const markdown = read(changelog);
  const release = findRelease(markdown, options.version);
  if (!release) {
    const available = parseChangelog(markdown).map((r) => r.version).slice(0, 10);
    throw new InputError(
      options.version
        ? `Version ${options.version} not found in ${changelog}. Available: ${available.join(', ') || 'none'}`
        : `No release found in ${changelog}`,
    );
  }
  return { release, source: changelog };
}

/** Load release notes from a changelog file, a markdown file, or the GitHub API. */
export async function loadRelease(options: LoadReleaseOptions): Promise<LoadedRelease> {
  if (options.release) {
    if (!options.repo) throw new InputError('--repo owner/name is required with --release');
    const gh = await fetchRelease(options.repo, options.release, options.token);
    return { release: releaseFromGitHub(gh), source: `GitHub release ${options.repo}@${gh.tag_name}`, githubRelease: gh };
  }
  return loadLocalRelease(options);
}
