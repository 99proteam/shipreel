import { describe, expect, it } from 'vitest';
import { buildTimeline, MIN_HIGHLIGHT_SECONDS } from '../src/timing.js';

const opts = { fps: 30, minDuration: 15, maxDuration: 30 };

describe('buildTimeline', () => {
  it('uses default durations: intro 2s, highlights 2.5s, fixes 2s, outro 3s', () => {
    const t = buildTimeline({ highlightCount: 5, hasFixes: true }, opts);
    expect(t.scenes.map((s) => [s.type, s.seconds])).toEqual([
      ['intro', 2],
      ['highlight', 2.5],
      ['highlight', 2.5],
      ['highlight', 2.5],
      ['highlight', 2.5],
      ['highlight', 2.5],
      ['fixes', 2],
      ['outro', 3],
    ]);
    expect(t.durationSeconds).toBe(19.5);
    expect(t.totalFrames).toBe(585);
  });

  it('keeps scenes contiguous', () => {
    const t = buildTimeline({ highlightCount: 3, hasFixes: true }, opts);
    let cursor = 0;
    for (const scene of t.scenes) {
      expect(scene.startFrame).toBe(cursor);
      cursor += scene.frames;
    }
    expect(cursor).toBe(t.totalFrames);
  });

  it('omits the fixes scene when there are no fixes', () => {
    const t = buildTimeline({ highlightCount: 2, hasFixes: false }, opts);
    expect(t.scenes.map((s) => s.type)).toEqual(['intro', 'highlight', 'highlight', 'outro']);
  });

  it('stretches short videos to the minimum duration', () => {
    const t = buildTimeline({ highlightCount: 1, hasFixes: false }, opts);
    expect(t.durationSeconds).toBe(15);
    expect(t.totalFrames).toBe(450);
    const [intro, highlight, outro] = t.scenes;
    expect(highlight!.seconds).toBeGreaterThan(intro!.seconds);
    expect(outro!.seconds).toBeGreaterThan(highlight!.seconds);
  });

  it('squeezes long videos to the maximum duration', () => {
    const t = buildTimeline({ highlightCount: 10, hasFixes: true }, opts);
    expect(t.durationSeconds).toBeLessThanOrEqual(30);
    expect(t.highlightCount).toBe(10);
    for (const s of t.scenes.filter((s) => s.type === 'highlight')) expect(s.seconds).toBeGreaterThanOrEqual(MIN_HIGHLIGHT_SECONDS);
  });

  it('drops highlights only when they would get too short', () => {
    const t = buildTimeline({ highlightCount: 10, hasFixes: true }, { fps: 30, minDuration: 5, maxDuration: 15 });
    expect(t.highlightCount).toBe(4);
    expect(t.durationSeconds).toBeLessThanOrEqual(15);
  });

  it('rounds to whole frames at any fps', () => {
    const t = buildTimeline({ highlightCount: 3, hasFixes: true }, { ...opts, fps: 24 });
    for (const s of t.scenes) expect(Number.isInteger(s.frames)).toBe(true);
    expect(t.durationSeconds).toBeCloseTo(t.totalFrames / 24, 10);
    expect(t.durationSeconds).toBeGreaterThanOrEqual(15);
  });

  it('honours custom durations', () => {
    const t = buildTimeline({ highlightCount: 2, hasFixes: false }, { ...opts, minDuration: 1, durations: { intro: 1, highlight: 1, outro: 1 } });
    expect(t.durationSeconds).toBe(4);
  });
});
