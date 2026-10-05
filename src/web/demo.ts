// Live demo for the website: parses pasted release notes in the browser and plays the exact
// scene documents the CLI renders to MP4. Bundled by scripts/build-site.mjs (no Node APIs here).
import type { ResolvedConfig } from '../config.js';
import { parseMarkdown, parseReleaseNotes } from '../parse/changelog.js';
import type { VideoPlan } from '../plan.js';
import { renderSceneDocument } from '../render/scene.js';
import type { LoadedTemplate, TemplateManifest } from '../render/template.js';
import { selectHighlights } from '../select.js';
import { buildTimeline } from '../timing.js';
import type { ParsedRelease, SceneType, SizeSpec, VideoContent } from '../types.js';

const SIZES: Record<string, SizeSpec> = {
  landscape: { name: 'landscape', width: 1920, height: 1080 },
  square: { name: 'square', width: 1080, height: 1080 },
  vertical: { name: 'vertical', width: 1080, height: 1920 },
};
const SCENES: SceneType[] = ['intro', 'highlight', 'fixes', 'outro'];
const FPS = 30;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const templateCache = new Map<string, Promise<LoadedTemplate>>();

function loadTemplate(name: string): Promise<LoadedTemplate> {
  let cached = templateCache.get(name);
  if (!cached) {
    const base = new URL(`templates/${name}/`, document.baseURI).href;
    cached = (async () => {
      const manifest = (await (await fetch(`${base}template.json`)).json()) as TemplateManifest;
      const entries = await Promise.all(
        SCENES.map(async (scene) => [scene, await (await fetch(base + (manifest.scenes?.[scene] ?? `${scene}.html`))).text()] as const),
      );
      return {
        name: manifest.name,
        dir: base,
        manifest,
        scenes: Object.fromEntries(entries) as Record<SceneType, string>,
        styles: manifest.styles ?? ['styles.css'],
        defaults: { font: manifest.defaults?.font ?? 'Inter', brandColor: manifest.defaults?.brandColor ?? '#6d28d9' },
      };
    })();
    templateCache.set(name, cached);
  }
  return cached;
}

/** Pick the release from a changelog, or treat the text as the notes of one release. */
export function pickRelease(markdown: string, version: string): ParsedRelease {
  const doc = parseMarkdown(markdown);
  const wanted = version.trim().replace(/^v/i, '');
  const released = doc.releases.filter((r) => r.version !== 'Unreleased' && r.items.length > 0);
  const match = wanted ? doc.releases.find((r) => r.version === wanted) : released[0];
  if (match && match.items.length) return match;
  return parseReleaseNotes(markdown, wanted || '1.0.0');
}

interface DemoState {
  plan?: VideoPlan;
  size: SizeSpec;
  frames: HTMLIFrameElement[];
  current: number;
  playing: boolean;
  lastTs: number;
  floatFrame: number;
  logo?: string;
  buildId: number;
}

const state: DemoState = { size: SIZES.landscape!, frames: [], current: 0, playing: false, lastTs: 0, floatFrame: 0, buildId: 0 };

async function buildPlan(): Promise<VideoPlan> {
  const templateName = $<HTMLSelectElement>('sr-template').value;
  const template = await loadTemplate(templateName);
  const release = pickRelease($<HTMLTextAreaElement>('sr-notes').value, $<HTMLInputElement>('sr-version').value);
  const maxItems = Number($<HTMLSelectElement>('sr-max').value) || 5;
  const selection = selectHighlights(release, { maxItems, maxChars: 72 });
  if (selection.highlights.length === 0) selection.highlights.push({ kind: 'other', text: 'Improvements and maintenance updates' });
  const timeline = buildTimeline(
    { highlightCount: selection.highlights.length, hasFixes: selection.fixCount > 0 },
    { fps: FPS, minDuration: 15, maxDuration: 30 },
  );
  const name = $<HTMLInputElement>('sr-name').value.trim() || 'my-project';
  const content: VideoContent = {
    projectName: name,
    version: release.version,
    ...(release.date ? { date: release.date } : {}),
    highlights: selection.highlights.slice(0, timeline.highlightCount),
    fixCount: selection.fixCount,
    highlightsAreFixes: selection.highlightsAreFixes,
  };
  const cta = $<HTMLInputElement>('sr-cta').value.trim();
  const repo = $<HTMLInputElement>('sr-repo').value.trim();
  const colorInput = $<HTMLInputElement>('sr-color');
  const config: ResolvedConfig = {
    template: templateName,
    sizes: [state.size],
    ctaSecondary: 'Star us on GitHub',
    maxItems,
    maxChars: 72,
    fps: FPS,
    outDir: '',
    minDuration: 15,
    maxDuration: 30,
    source: 'web',
    ...(cta ? { cta } : {}),
    ...(/^[\w.-]+\/[\w.-]+$/.test(repo) ? { repo } : {}),
  };
  return {
    content,
    timeline,
    template,
    config,
    brandColor: colorInput.dataset.touched ? colorInput.value : template.defaults.brandColor,
    font: template.defaults.font,
    ...(state.logo ? { logoDataUri: state.logo } : {}),
  };
}

function renderInfo(plan: VideoPlan): void {
  const list = $('sr-highlights');
  list.innerHTML = '';
  for (const h of plan.content.highlights) {
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = `kind kind-${h.kind}`;
    tag.textContent = h.kind;
    li.append(tag, document.createTextNode(h.text));
    list.append(li);
  }
  if (plan.content.fixCount > 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = `+ ${plan.content.fixCount} ${plan.content.highlightsAreFixes ? 'more fixes' : 'bug fixes'} (summary scene)`;
    list.append(li);
  }
  $('sr-meta').textContent = `${plan.content.projectName} ${/^\d/.test(plan.content.version) ? 'v' : ''}${plan.content.version} · ${plan.timeline.durationSeconds.toFixed(1)}s · ${plan.timeline.scenes.length} scenes`;
  const chips = $('sr-scenes');
  chips.innerHTML = '';
  plan.timeline.scenes.forEach((scene) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = scene.type === 'highlight' ? `highlight ${scene.index + 1}` : scene.type;
    b.addEventListener('click', () => seek(scene.startFrame));
    chips.append(b);
  });
}

function fit(): void {
  const stage = $('sr-stage');
  const frame = $('sr-frame');
  const { width, height } = state.size;
  const box = stage.getBoundingClientRect();
  const scale = Math.min(box.width / width, (box.height || box.width * (height / width)) / height);
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function seek(frame: number): void {
  const plan = state.plan;
  if (!plan) return;
  state.current = Math.max(0, Math.min(plan.timeline.totalFrames - 1, Math.round(frame)));
  const scrub = $<HTMLInputElement>('sr-scrub');
  scrub.value = String(state.current);
  $('sr-time').textContent = `${(state.current / FPS).toFixed(1)}s / ${plan.timeline.durationSeconds.toFixed(1)}s`;
  plan.timeline.scenes.forEach((scene, i) => {
    const active = state.current >= scene.startFrame && state.current < scene.startFrame + scene.frames;
    const iframe = state.frames[i];
    if (!iframe) return;
    iframe.classList.toggle('active', active);
    if (active) {
      const win = iframe.contentWindow as (Window & { __shipreelSeek?: (ms: number) => void }) | null;
      win?.__shipreelSeek?.(((state.current - scene.startFrame) / FPS) * 1000);
    }
  });
}

function tick(ts: number): void {
  if (!state.playing || !state.plan) return;
  if (state.lastTs) {
    state.floatFrame += ((ts - state.lastTs) / 1000) * FPS;
    if (state.floatFrame >= state.plan.timeline.totalFrames) state.floatFrame = 0;
    seek(state.floatFrame);
  }
  state.lastTs = ts;
  requestAnimationFrame(tick);
}

function setPlaying(playing: boolean): void {
  state.playing = playing;
  state.lastTs = 0;
  state.floatFrame = state.current;
  const button = $('sr-play');
  button.textContent = playing ? 'Pause' : 'Play';
  button.setAttribute('aria-pressed', String(playing));
  if (playing) requestAnimationFrame(tick);
}

async function rebuild(): Promise<void> {
  const id = ++state.buildId;
  const error = $('sr-error');
  try {
    const plan = await buildPlan();
    if (id !== state.buildId) return;
    error.hidden = true;
    state.plan = plan;
    renderInfo(plan);
    const frame = $('sr-frame');
    frame.innerHTML = '';
    const assetBase = plan.template.dir;
    state.frames = plan.timeline.scenes.map((_, i) => {
      const iframe = document.createElement('iframe');
      iframe.title = `Scene ${i + 1}`;
      iframe.width = String(state.size.width);
      iframe.height = String(state.size.height);
      iframe.setAttribute('scrolling', 'no');
      iframe.srcdoc = renderSceneDocument(plan, state.size, i, { assetBase });
      iframe.addEventListener('load', () => seek(state.current));
      frame.append(iframe);
      return iframe;
    });
    const scrub = $<HTMLInputElement>('sr-scrub');
    scrub.max = String(plan.timeline.totalFrames - 1);
    if (state.current >= plan.timeline.totalFrames) state.current = 0;
    fit();
    seek(state.current);
  } catch (e) {
    error.hidden = false;
    error.textContent = `Could not build the preview: ${(e as Error).message}`;
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: number | undefined;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

async function loadSample(file: string, name: string, template: string): Promise<void> {
  const text = await (await fetch(new URL(`samples/${file}`, document.baseURI))).text();
  $<HTMLTextAreaElement>('sr-notes').value = text;
  $<HTMLInputElement>('sr-name').value = name;
  $<HTMLInputElement>('sr-version').value = '';
  $<HTMLSelectElement>('sr-template').value = template;
  const color = $<HTMLInputElement>('sr-color');
  delete color.dataset.touched;
  color.value = (await loadTemplate(template)).defaults.brandColor;
  state.current = 0;
  await rebuild();
}

function init(): void {
  if (!document.getElementById('sr-demo')) return;
  const schedule = debounce(() => void rebuild(), 250);
  for (const id of ['sr-notes', 'sr-name', 'sr-version', 'sr-cta', 'sr-repo']) $(id).addEventListener('input', schedule);
  for (const id of ['sr-template', 'sr-max']) $(id).addEventListener('change', schedule);
  $('sr-color').addEventListener('input', (e) => {
    (e.target as HTMLInputElement).dataset.touched = '1';
    schedule();
  });
  $('sr-template').addEventListener('change', () => {
    delete $('sr-color').dataset.touched;
    void loadTemplate($<HTMLSelectElement>('sr-template').value).then((t) => {
      $<HTMLInputElement>('sr-color').value = t.defaults.brandColor;
    });
  });
  $('sr-logo').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      delete state.logo;
      schedule();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.logo = String(reader.result);
      schedule();
    };
    reader.readAsDataURL(file);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((button) => {
    button.addEventListener('click', () => {
      state.size = SIZES[button.dataset.size!]!;
      document.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      $('sr-stage').dataset.orientation = button.dataset.size!;
      void rebuild();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((button) => {
    button.addEventListener('click', () => void loadSample(button.dataset.sample!, button.dataset.name!, button.dataset.template!));
  });
  $('sr-play').addEventListener('click', () => setPlaying(!state.playing));
  $('sr-scrub').addEventListener('input', (e) => {
    if (state.playing) setPlaying(false);
    seek(Number((e.target as HTMLInputElement).value));
  });
  window.addEventListener('resize', fit);
  void loadSample('keep-a-changelog.md', 'acme-ui', 'minimal').then(() => setPlaying(true));
}

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.copy!);
    if (!target) return;
    void navigator.clipboard.writeText(target.textContent ?? '').then(() => {
      const label = button.textContent;
      button.textContent = 'Copied!';
      window.setTimeout(() => (button.textContent = label), 1500);
    });
  });
});

init();
