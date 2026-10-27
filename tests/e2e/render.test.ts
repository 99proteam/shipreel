import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffprobe from 'ffprobe-static';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { findRelease } from '../../src/parse/changelog.js';
import { buildPlan } from '../../src/plan.js';
import { renderVideos } from '../../src/render/render.js';

interface Probe {
  streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string; r_frame_rate?: string; nb_frames?: string }>;
  format: { duration: string };
}

function probe(file: string): Probe {
  const out = execFileSync(ffprobe.path, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(out) as Probe;
}

describe('end-to-end render', () => {
  it('renders a changelog fixture to MP4s with the expected duration and resolution', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'shipreel-e2e-'));
    const markdown = readFileSync(new URL('../fixtures/keep-a-changelog.md', import.meta.url), 'utf8');
    const release = findRelease(markdown)!;
    const config = loadConfig({
      cwd: outDir,
      // Small sizes and a low frame rate keep the test fast; "system-ui" avoids network fonts.
      overrides: { name: 'acme-ui', sizes: '320x180,180x320', fps: 10, font: 'system-ui', outDir, maxItems: 2 },
    });
    const plan = buildPlan(release, config);
    const videos = await renderVideos(plan);

    expect(videos).toHaveLength(2);
    const expected = plan.timeline.totalFrames / plan.timeline.fps;
    expect(expected).toBeGreaterThanOrEqual(15);
    expect(expected).toBeLessThanOrEqual(30);

    for (const [index, video] of videos.entries()) {
      expect(existsSync(video.file)).toBe(true);
      const size = config.sizes[index]!;
      const info = probe(video.file);
      const stream = info.streams.find((s) => s.codec_type === 'video')!;
      expect(stream.codec_name).toBe('h264');
      expect(stream.pix_fmt).toBe('yuv420p');
      expect(stream.width).toBe(size.width);
      expect(stream.height).toBe(size.height);
      expect(stream.r_frame_rate).toBe('10/1');
      expect(Number(stream.nb_frames)).toBe(plan.timeline.totalFrames);
      expect(Number(info.format.duration)).toBeCloseTo(expected, 1);
    }
  });

  it('exports a PNG poster and a GIF next to each video', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'shipreel-e2e-extras-'));
    const markdown = readFileSync(new URL('../fixtures/keep-a-changelog.md', import.meta.url), 'utf8');
    const config = loadConfig({
      cwd: outDir,
      overrides: { name: 'acme-ui', sizes: '320x180', fps: 10, font: 'system-ui', outDir, maxItems: 1, poster: true, gif: true },
    });
    const [video] = await renderVideos(buildPlan(findRelease(markdown)!, config));

    expect(video!.poster).toBe(video!.file.replace(/\.mp4$/, '.png'));
    const png = readFileSync(video!.poster!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    // PNG IHDR: width and height are big-endian at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 180]);

    const gif = probe(video!.gif!).streams.find((s) => s.codec_type === 'video')!;
    expect(gif.codec_name).toBe('gif');
    expect([gif.width, gif.height]).toEqual([320, 180]);
  });
});
