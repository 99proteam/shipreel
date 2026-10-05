import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRelease, parseRepo, uploadReleaseAsset, type GitHubRelease } from '../src/github.js';
import { releaseFromGitHub } from '../src/input.js';

const release: GitHubRelease = {
  id: 1,
  tag_name: 'v1.8.0',
  name: 'v1.8.0',
  body: "## What's Changed\n* feat: thing by @a in https://github.com/o/r/pull/1\n* fix: bug by @b in https://github.com/o/r/pull/2",
  draft: false,
  prerelease: false,
  published_at: '2026-10-01T12:00:00Z',
  created_at: '2026-10-01T11:00:00Z',
  html_url: 'https://github.com/o/r/releases/tag/v1.8.0',
  upload_url: 'https://uploads.github.com/repos/o/r/releases/1/assets{?name,label}',
  assets: [{ id: 9, name: 'r-v1.8.0-square.mp4', browser_download_url: 'x' }],
};

function respond(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub API', () => {
  it('parses owner/name', () => {
    expect(parseRepo('o/r')).toEqual({ owner: 'o', name: 'r' });
    expect(() => parseRepo('nope')).toThrow(/owner\/name/);
  });

  it('fetches a release by tag with auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, release));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchRelease('o/r', 'v1.8.0', 'secret');
    expect(result.tag_name).toBe('v1.8.0');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/o/r/releases/tags/v1.8.0');
    expect(init.headers.authorization).toBe('Bearer secret');
  });

  it('retries with/without the "v" prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(404, { message: 'Not Found' })).mockResolvedValueOnce(respond(200, release));
    vi.stubGlobal('fetch', fetchMock);
    await fetchRelease('o/r', '1.8.0');
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.github.com/repos/o/r/releases/tags/v1.8.0');
  });

  it('replaces an existing asset when uploading', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'shipreel-gh-'));
    const file = path.join(dir, 'r-v1.8.0-square.mp4');
    writeFileSync(file, 'video');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(204, null))
      .mockResolvedValueOnce(respond(201, { name: 'r-v1.8.0-square.mp4', browser_download_url: 'https://dl' }));
    vi.stubGlobal('fetch', fetchMock);
    const asset = await uploadReleaseAsset('o/r', release, file, 'secret');
    expect(asset.browser_download_url).toBe('https://dl');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.github.com/repos/o/r/releases/assets/9');
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[1]![0]).toBe('https://uploads.github.com/repos/o/r/releases/1/assets?name=r-v1.8.0-square.mp4');
    expect(fetchMock.mock.calls[1]![1].headers['content-type']).toBe('video/mp4');
  });

  it('turns a release payload into a parsed release', () => {
    const parsed = releaseFromGitHub(release);
    expect(parsed).toMatchObject({ version: '1.8.0', date: '2026-10-01' });
    expect(parsed.items.map((i) => i.kind)).toEqual(['feature', 'fix']);
  });
});
