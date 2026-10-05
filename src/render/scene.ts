import type { VideoPlan } from '../plan.js';
import type { SceneTiming } from '../timing.js';
import type { SizeSpec } from '../types.js';
import { ICONS, KIND_ICONS, KIND_LABELS } from './icons.js';
import { BASE_CSS, RUNTIME_JS } from './runtime.js';
import { escapeHtml, renderString } from './mustache.js';

/** Pick black or white text for a background color. */
export function contrastColor(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? '#0b0b0f' : '#ffffff';
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function versionLabel(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

export function textSize(text: string): 'xl' | 'l' | 'm' | 's' {
  if (text.length <= 24) return 'xl';
  if (text.length <= 40) return 'l';
  if (text.length <= 58) return 'm';
  return 's';
}

export function nameSize(name: string): 'l' | 'm' | 's' {
  if (name.length <= 10) return 'l';
  if (name.length <= 18) return 'm';
  return 's';
}

const COMMAND = /^(npm|npx|pnpm|yarn|bun|bunx|deno|pip|pipx|uv|brew|cargo|go|docker|curl|wget|gem|composer|dotnet|apt|apt-get|winget|scoop|choco|helm|kubectl)\s/;
export function isCommand(text: string): boolean {
  return COMMAND.test(text.trim());
}

export function orientation(size: SizeSpec): 'landscape' | 'portrait' | 'square' {
  if (size.width === size.height) return 'square';
  return size.width > size.height ? 'landscape' : 'portrait';
}

/** All variables available to scene templates (documented in docs/templates.md). */
export function buildSceneView(plan: VideoPlan, size: SizeSpec, scene: SceneTiming): Record<string, unknown> {
  const { content, config } = plan;
  const highlights = content.highlights;
  const repoLabel = config.repo ? `github.com/${config.repo}` : '';
  const fixLabel = content.highlightsAreFixes
    ? content.fixCount === 1 ? 'more fix' : 'more fixes'
    : content.fixCount === 1 ? 'bug fix' : 'bug fixes';

  const view: Record<string, unknown> = {
    projectName: content.projectName,
    monogram: (content.projectName.replace(/^@[^/]+\//, '').match(/[a-z0-9]/i)?.[0] ?? '#').toUpperCase(),
    version: content.version,
    versionLabel: versionLabel(content.version),
    date: content.date ?? '',
    dateLabel: formatDate(content.date),
    logo: plan.logoDataUri ?? '',
    brandColor: plan.brandColor,
    brandContrast: contrastColor(plan.brandColor),
    font: plan.font ?? '',
    repo: config.repo ?? '',
    repoLabel,
    url: config.url ?? '',
    urlLabel: (config.url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    cta: config.cta ?? '',
    ctaIsCommand: isCommand(config.cta ?? ''),
    ctaCommand: config.cta ? (isCommand(config.cta) ? config.cta : `open ${config.cta}`) : '',
    footerLabel: repoLabel || (config.url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    nameSize: nameSize(content.projectName),
    ctaSecondary: config.ctaSecondary,
    sceneType: scene.type,
    sceneSeconds: scene.seconds,
    size: size.name,
    width: size.width,
    height: size.height,
    orientation: orientation(size),
    totalHighlights: highlights.length,
    fixCount: content.fixCount,
    fixLabel,
    fixText: `+ ${content.fixCount} ${fixLabel}`,
    hasFixes: content.fixCount > 0,
    icons: ICONS,
    dots: highlights.map((_, i) => ({ active: scene.type === 'highlight' && i === scene.index, done: scene.type === 'highlight' && i < scene.index })),
  };

  if (scene.type === 'highlight') {
    const highlight = highlights[scene.index]!;
    Object.assign(view, {
      text: highlight.text,
      kind: highlight.kind,
      kindLabel: KIND_LABELS[highlight.kind] ?? '',
      icon: KIND_ICONS[highlight.kind] ?? ICONS.sparkles,
      index: scene.index + 1,
      indexPadded: String(scene.index + 1).padStart(2, '0'),
      total: highlights.length,
      textSize: textSize(highlight.text),
      parity: scene.index % 2 === 0 ? 'odd' : 'even',
    });
  }
  return view;
}

function fontLinks(font: string | undefined): string {
  if (!font) return '';
  const family = encodeURIComponent(font).replace(/%20/g, '+');
  // One stylesheet per weight: Google Fonts rejects a whole request if any weight is missing,
  // so single-weight fonts still get the weights they have.
  const links = ['', ':wght@500', ':wght@600', ':wght@700', ':wght@800', ':wght@900'].map(
    (weight) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}${weight}&amp;display=block">`,
  );
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    ...links,
  ].join('\n');
}

export interface SceneDocumentOptions {
  /** URL prefix where template assets are served (must end with "/"). */
  assetBase: string;
}

/** Build the full HTML document for one scene at one size. */
export function renderSceneDocument(plan: VideoPlan, size: SizeSpec, sceneIndex: number, options: SceneDocumentOptions): string {
  const scene = plan.timeline.scenes[sceneIndex];
  if (!scene) throw new Error(`Scene ${sceneIndex} does not exist`);
  const view = buildSceneView(plan, size, scene);
  const body = renderString(plan.template.scenes[scene.type], view);
  const last = sceneIndex === plan.timeline.scenes.length - 1;
  const classes = ['scene', `scene-${scene.type}`, sceneIndex === 0 ? 'sr-first' : '', last ? 'sr-last' : ''].filter(Boolean).join(' ');
  const vars = [
    `--brand:${plan.brandColor}`,
    `--brand-contrast:${view.brandContrast as string}`,
    plan.font ? `--font:"${plan.font.replace(/"/g, '')}"` : '--font:system-ui',
    `--duration:${Number(scene.seconds.toFixed(3))}s`,
    `--name-chars:${Math.max(4, plan.content.projectName.length)}`,
    `--w:${size.width}px`,
    `--h:${size.height}px`,
  ].join(';');
  const stylesheets = plan.template.styles.map((s) => `<link rel="stylesheet" href="${escapeHtml(options.assetBase + s)}">`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${size.width},height=${size.height}">
<title>${escapeHtml(`${plan.content.projectName} — ${scene.type}`)}</title>
<base href="${escapeHtml(options.assetBase)}">
${fontLinks(plan.font)}
<style>${BASE_CSS}</style>
${stylesheets}
</head>
<body class="sr-${escapeHtml(size.name)} sr-${orientation(size)}" style="${escapeHtml(vars)}">
<main class="${classes}">
${body}
</main>
<script>${RUNTIME_JS}</script>
</body>
</html>`;
}
