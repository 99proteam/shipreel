import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ResolvedConfig } from './config.js';
import { loadTemplate, type LoadedTemplate } from './render/template.js';
import { selectHighlights } from './select.js';
import { buildTimeline, type Timeline } from './timing.js';
import type { ParsedRelease, VideoContent } from './types.js';

export interface VideoPlan {
  content: VideoContent;
  timeline: Timeline;
  template: LoadedTemplate;
  config: ResolvedConfig;
  brandColor: string;
  font?: string;
  logoDataUri?: string;
}

export const FALLBACK_HIGHLIGHT = 'Improvements and maintenance updates';

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function fileToDataUri(file: string): string {
  if (!existsSync(file)) throw new Error(`Logo file not found: ${file}`);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported logo format ${path.extname(file)} (use svg, png, jpg, webp or gif).`);
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

export interface BuildPlanOptions {
  /** Project name when config.name is not set (e.g. the repository name). */
  projectName?: string;
}

/** Combine a parsed release with the config: select highlights, compute timing, load the template. */
export function buildPlan(release: ParsedRelease, config: ResolvedConfig, options: BuildPlanOptions = {}): VideoPlan {
  const template = loadTemplate(config.template);
  const selection = selectHighlights(release, { maxItems: config.maxItems, maxChars: config.maxChars });
  if (selection.highlights.length === 0) selection.highlights.push({ kind: 'other', text: FALLBACK_HIGHLIGHT });

  const timeline = buildTimeline(
    { highlightCount: selection.highlights.length, hasFixes: selection.fixCount > 0 },
    { fps: config.fps, minDuration: config.minDuration, maxDuration: config.maxDuration },
  );

  const projectName = config.name ?? options.projectName ?? path.basename(process.cwd());
  const content: VideoContent = {
    projectName,
    version: release.version,
    ...(release.date ? { date: release.date } : {}),
    highlights: selection.highlights.slice(0, timeline.highlightCount),
    fixCount: selection.fixCount,
    highlightsAreFixes: selection.highlightsAreFixes,
  };

  const font = config.font ?? template.defaults.font;
  const plan: VideoPlan = {
    content,
    timeline,
    template,
    config,
    brandColor: config.brandColor ?? template.defaults.brandColor,
  };
  if (font && !/^(system|system-ui|none)$/i.test(font)) plan.font = font;
  if (config.logo) plan.logoDataUri = fileToDataUri(config.logo);
  return plan;
}

/** Reload template files and recompute the plan (used by the preview server after edits). */
export function refreshPlan(plan: VideoPlan): VideoPlan {
  return { ...plan, template: loadTemplate(plan.config.template) };
}
