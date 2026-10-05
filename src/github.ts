import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at: string;
  html_url: string;
  upload_url: string;
  assets: Array<{ id: number; name: string; browser_download_url: string }>;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

function apiBase(): string {
  return (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'shipreel',
  };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function request<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(url, { ...rest, headers: { ...headers(token), ...(rest.headers as Record<string, string> | undefined) } });
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { message?: string }).message ?? '';
    } catch {
      // ignore
    }
    const hint = res.status === 401 || res.status === 403 ? ' (check GITHUB_TOKEN permissions)' : '';
    throw new GitHubError(`GitHub API ${rest.method ?? 'GET'} ${url} failed: ${res.status} ${detail}${hint}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function parseRepo(repo: string): { owner: string; name: string } {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(repo.trim());
  if (!match) throw new GitHubError(`Invalid repository "${repo}", expected owner/name`);
  return { owner: match[1]!, name: match[2]! };
}

/** Fetch a release by tag, or the latest release when tag is "latest". */
export async function fetchRelease(repo: string, tag: string, token?: string): Promise<GitHubRelease> {
  const { owner, name } = parseRepo(repo);
  const base = `${apiBase()}/repos/${owner}/${name}/releases`;
  const url = tag === 'latest' ? `${base}/latest` : `${base}/tags/${encodeURIComponent(tag)}`;
  try {
    return await request<GitHubRelease>(url, { token });
  } catch (error) {
    // Tags are often given without the "v" prefix (or with it when the repo has none).
    if (error instanceof GitHubError && error.status === 404 && tag !== 'latest') {
      const alternative = tag.startsWith('v') ? tag.slice(1) : `v${tag}`;
      try {
        return await request<GitHubRelease>(`${base}/tags/${encodeURIComponent(alternative)}`, { token });
      } catch {
        throw new GitHubError(`Release ${tag} not found in ${repo}`, 404);
      }
    }
    throw error;
  }
}

export async function getRelease(repo: string, id: number, token?: string): Promise<GitHubRelease> {
  const { owner, name } = parseRepo(repo);
  return request<GitHubRelease>(`${apiBase()}/repos/${owner}/${name}/releases/${id}`, { token });
}

/** Upload a file as a release asset, replacing an existing asset with the same name. */
export async function uploadReleaseAsset(
  repo: string,
  release: GitHubRelease,
  file: string,
  token: string,
): Promise<{ name: string; browser_download_url: string }> {
  const { owner, name } = parseRepo(repo);
  const assetName = path.basename(file);
  const existing = release.assets.find((a) => a.name === assetName);
  if (existing) {
    await request<void>(`${apiBase()}/repos/${owner}/${name}/releases/assets/${existing.id}`, { method: 'DELETE', token });
  }
  const uploadUrl = new URL(release.upload_url.replace(/\{.*\}$/, ''));
  uploadUrl.searchParams.set('name', assetName);
  const data = readFileSync(file);
  return request(uploadUrl.toString(), {
    method: 'POST',
    token,
    headers: { 'content-type': 'video/mp4', 'content-length': String(statSync(file).size) },
    body: data,
  });
}
