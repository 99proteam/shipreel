import type { SceneType } from './types.js';

export interface SceneDurations {
  intro: number;
  highlight: number;
  fixes: number;
  outro: number;
}

export const DEFAULT_DURATIONS: SceneDurations = { intro: 2, highlight: 2.5, fixes: 2, outro: 3 };
/** Highlights are never shortened below this, to keep them readable. */
export const MIN_HIGHLIGHT_SECONDS = 1.8;

export interface TimelineInput {
  highlightCount: number;
  hasFixes: boolean;
}

export interface TimelineOptions {
  fps: number;
  minDuration: number;
  maxDuration: number;
  durations?: Partial<SceneDurations>;
}

export interface SceneTiming {
  type: SceneType;
  /** Index among scenes of the same type (highlight 0, 1, 2...). */
  index: number;
  startFrame: number;
  frames: number;
  seconds: number;
}

export interface Timeline {
  fps: number;
  scenes: SceneTiming[];
  totalFrames: number;
  durationSeconds: number;
  /** Number of highlights that fit (may be lower than requested when maxDuration is tight). */
  highlightCount: number;
}

/**
 * Compute scene durations: intro, one scene per highlight, optional fixes summary, outro.
 * The total is stretched to `minDuration` and squeezed to `maxDuration` (dropping
 * highlights only as a last resort). Durations are rounded to whole frames.
 */
export function buildTimeline(input: TimelineInput, options: TimelineOptions): Timeline {
  const d: SceneDurations = { ...DEFAULT_DURATIONS, ...options.durations };
  const { fps, minDuration, maxDuration } = options;
  let count = Math.max(0, Math.floor(input.highlightCount));

  const fixed = d.intro + d.outro + (input.hasFixes ? d.fixes : 0);
  let perHighlight = d.highlight;
  if (count > 0 && fixed + count * perHighlight > maxDuration) {
    const available = Math.max(0, maxDuration - fixed);
    perHighlight = available / count;
    if (perHighlight < MIN_HIGHLIGHT_SECONDS) {
      count = Math.max(1, Math.floor(available / MIN_HIGHLIGHT_SECONDS));
      perHighlight = Math.min(d.highlight, Math.max(MIN_HIGHLIGHT_SECONDS, available / count));
    }
  }

  const plan: Array<{ type: SceneType; index: number; seconds: number }> = [{ type: 'intro', index: 0, seconds: d.intro }];
  for (let i = 0; i < count; i++) plan.push({ type: 'highlight', index: i, seconds: perHighlight });
  if (input.hasFixes) plan.push({ type: 'fixes', index: 0, seconds: d.fixes });
  plan.push({ type: 'outro', index: 0, seconds: d.outro });

  const total = plan.reduce((sum, s) => sum + s.seconds, 0);
  let targetFrames: number | undefined;
  if (total < minDuration) {
    const factor = minDuration / total;
    for (const scene of plan) scene.seconds *= factor;
    targetFrames = Math.ceil(minDuration * fps);
  }

  const scenes: SceneTiming[] = [];
  let cursor = 0;
  for (const scene of plan) {
    const frames = Math.max(1, Math.round(scene.seconds * fps));
    scenes.push({ ...scene, startFrame: cursor, frames, seconds: frames / fps });
    cursor += frames;
  }

  // Rounding drift: make sure a stretched video still reaches minDuration exactly.
  const last = scenes[scenes.length - 1]!;
  if (targetFrames !== undefined && cursor !== targetFrames) {
    last.frames += targetFrames - cursor;
    last.seconds = last.frames / fps;
    cursor = targetFrames;
  }
  const maxFrames = Math.floor(maxDuration * fps);
  if (cursor > maxFrames && last.frames - (cursor - maxFrames) >= 1) {
    last.frames -= cursor - maxFrames;
    last.seconds = last.frames / fps;
    cursor = maxFrames;
  }

  return { fps, scenes, totalFrames: cursor, durationSeconds: cursor / fps, highlightCount: count };
}
