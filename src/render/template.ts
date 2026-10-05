import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneType } from '../types.js';

export const BUILTIN_TEMPLATES = ['minimal', 'terminal', 'bold'] as const;
export const SCENE_TYPES: SceneType[] = ['intro', 'highlight', 'fixes', 'outro'];

export interface TemplateManifest {
  name: string;
  description?: string;
  defaults?: { font?: string; brandColor?: string };
  /** Scene HTML files, relative to the template folder. */
  scenes?: Partial<Record<SceneType, string>>;
  /** Stylesheets, relative to the template folder. */
  styles?: string[];
}

export interface LoadedTemplate {
  name: string;
  dir: string;
  manifest: TemplateManifest;
  scenes: Record<SceneType, string>;
  styles: string[];
  defaults: { font: string; brandColor: string };
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

let cachedRoot: string | undefined;

/** Locate the installed shipreel package root (works from src/ in tests and dist/ when published). */
export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg) && existsSync(path.join(dir, 'templates'))) {
      try {
        if ((JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name === 'shipreel') return (cachedRoot = dir);
      } catch {
        // keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new TemplateError('Could not locate the shipreel package root (templates folder missing).');
    dir = parent;
  }
}

export function builtinTemplateDir(name: string): string {
  return path.join(packageRoot(), 'templates', name);
}

/** Load a built-in template by name or a custom template from a folder path. Files are read fresh every call. */
export function loadTemplate(nameOrPath: string): LoadedTemplate {
  const isBuiltin = (BUILTIN_TEMPLATES as readonly string[]).includes(nameOrPath);
  const dir = isBuiltin ? builtinTemplateDir(nameOrPath) : path.resolve(nameOrPath);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new TemplateError(
      `Template "${nameOrPath}" not found. Use one of ${BUILTIN_TEMPLATES.join(', ')} or a path to a template folder.`,
    );
  }

  const manifestPath = path.join(dir, 'template.json');
  let manifest: TemplateManifest = { name: path.basename(dir) };
  if (existsSync(manifestPath)) {
    try {
      manifest = { name: path.basename(dir), ...(JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<TemplateManifest>) };
    } catch (error) {
      throw new TemplateError(`Invalid template.json in ${dir}: ${(error as Error).message}`);
    }
  }

  const scenes = {} as Record<SceneType, string>;
  for (const type of SCENE_TYPES) {
    const file = path.join(dir, manifest.scenes?.[type] ?? `${type}.html`);
    if (!existsSync(file)) throw new TemplateError(`Template "${manifest.name}" is missing the ${type} scene (${file}).`);
    scenes[type] = readFileSync(file, 'utf8');
  }

  const styles = manifest.styles ?? (existsSync(path.join(dir, 'styles.css')) ? ['styles.css'] : []);
  for (const style of styles) {
    if (!existsSync(path.join(dir, style))) throw new TemplateError(`Template "${manifest.name}" references missing stylesheet ${style}.`);
  }

  return {
    name: manifest.name,
    dir,
    manifest,
    scenes,
    styles,
    defaults: {
      font: manifest.defaults?.font ?? 'Inter',
      brandColor: manifest.defaults?.brandColor ?? '#6d28d9',
    },
  };
}

type View = Record<string, unknown>;

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => escapeMap[c]!);
}

function lookup(view: View, key: string): unknown {
  if (key === '.') return view['.'];
  return key.split('.').reduce<unknown>((obj, part) => (obj && typeof obj === 'object' ? (obj as View)[part] : undefined), view);
}

function truthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/**
 * Minimal mustache-style renderer: `{{var}}` (escaped), `{{{var}}}` (raw),
 * `{{#var}}...{{/var}}` (section / loop), `{{^var}}...{{/var}}` (inverted section).
 */
export function renderString(template: string, view: View): string {
  const section = /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g;
  let output = template.replace(section, (_match, type: string, key: string, inner: string) => {
    const value = lookup(view, key);
    if (type === '^') return truthy(value) ? '' : renderString(inner, view);
    if (!truthy(value)) return '';
    if (Array.isArray(value)) {
      return value
        .map((item) => renderString(inner, { ...view, ...(item && typeof item === 'object' ? (item as View) : {}), '.': item }))
        .join('');
    }
    return renderString(inner, view);
  });
  output = output.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key: string) => String(lookup(view, key) ?? ''));
  output = output.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => escapeHtml(String(lookup(view, key) ?? '')));
  return output;
}
