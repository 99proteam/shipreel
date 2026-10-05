import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SizeSpec } from './types.js';

export const SIZE_PRESETS: Record<string, SizeSpec> = {
  landscape: { name: 'landscape', width: 1920, height: 1080 },
  square: { name: 'square', width: 1080, height: 1080 },
  vertical: { name: 'vertical', width: 1080, height: 1920 },
};

/** Shape of `shipreel.config.json` (or the `shipreel` key in package.json). */
export interface ShipreelConfigFile {
  name?: string;
  template?: string;
  brandColor?: string;
  logo?: string;
  font?: string;
  sizes?: string[] | string;
  cta?: string;
  ctaSecondary?: string;
  url?: string;
  repo?: string;
  maxItems?: number;
  maxChars?: number;
  music?: string;
  fps?: number;
  outDir?: string;
  minDuration?: number;
  maxDuration?: number;
  changelog?: string;
}

export interface ResolvedConfig {
  name?: string;
  template: string;
  brandColor?: string;
  /** Absolute path to the logo file. */
  logo?: string;
  font?: string;
  sizes: SizeSpec[];
  cta?: string;
  ctaSecondary: string;
  url?: string;
  repo?: string;
  maxItems: number;
  maxChars: number;
  /** Absolute path to the background music file. */
  music?: string;
  fps: number;
  outDir: string;
  minDuration: number;
  maxDuration: number;
  changelog?: string;
  /** Where the config was read from, for logging. */
  source: string;
}

export const DEFAULTS = {
  template: 'minimal',
  sizes: ['landscape', 'square', 'vertical'],
  ctaSecondary: 'Star us on GitHub',
  maxItems: 5,
  maxChars: 72,
  fps: 30,
  outDir: 'videos',
  minDuration: 15,
  maxDuration: 30,
} as const;

const KNOWN_KEYS = new Set<string>([
  'name', 'template', 'brandColor', 'logo', 'font', 'sizes', 'cta', 'ctaSecondary', 'url', 'repo',
  'maxItems', 'maxChars', 'music', 'fps', 'outDir', 'minDuration', 'maxDuration', 'changelog', '$schema',
]);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseSize(value: string): SizeSpec {
  const key = value.trim().toLowerCase();
  const preset = SIZE_PRESETS[key];
  if (preset) return { ...preset };
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(key);
  if (!match) {
    throw new ConfigError(
      `Unknown size "${value}". Use landscape, square, vertical or WIDTHxHEIGHT (e.g. 1280x720).`,
    );
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new ConfigError(`Size "${value}" must use even dimensions (required by H.264).`);
  }
  return { name: key, width, height };
}

export function parseSizes(value: string[] | string): SizeSpec[] {
  const list = Array.isArray(value) ? value : value.split(',');
  const sizes = list.map((s) => s.trim()).filter(Boolean).map(parseSize);
  if (sizes.length === 0) throw new ConfigError('At least one size is required.');
  const unique = new Map(sizes.map((s) => [s.name, s]));
  return [...unique.values()];
}

interface PackageJson {
  name?: string;
  private?: boolean;
  homepage?: string;
  repository?: string | { url?: string };
  shipreel?: ShipreelConfigFile;
}

export function readPackageJson(cwd: string): PackageJson | undefined {
  const file = path.join(cwd, 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
  } catch {
    return undefined;
  }
}

/** Extract "owner/name" from a repository URL or shorthand. */
export function repoFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url) ?? /^(?:github:)?([\w.-]+)\/([\w.-]+)$/.exec(url);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

function validate(raw: Record<string, unknown>, source: string): ShipreelConfigFile {
  const errors: string[] = [];
  const unknown = Object.keys(raw).filter((k) => !KNOWN_KEYS.has(k));
  if (unknown.length) errors.push(`unknown key(s): ${unknown.join(', ')}`);

  const str = (key: string) => {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') errors.push(`"${key}" must be a string`);
  };
  const num = (key: string, min: number, max: number) => {
    const v = raw[key];
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      errors.push(`"${key}" must be a number between ${min} and ${max}`);
    }
  };

  for (const key of ['name', 'template', 'brandColor', 'logo', 'font', 'cta', 'ctaSecondary', 'url', 'repo', 'music', 'outDir', 'changelog']) {
    str(key);
  }
  num('maxItems', 1, 10);
  num('maxChars', 20, 200);
  num('fps', 1, 60);
  num('minDuration', 1, 120);
  num('maxDuration', 1, 180);

  if (typeof raw.brandColor === 'string' && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.brandColor)) {
    errors.push(`"brandColor" must be a hex color like #6d28d9`);
  }
  if (raw.sizes !== undefined && !(typeof raw.sizes === 'string' || (Array.isArray(raw.sizes) && raw.sizes.every((s) => typeof s === 'string')))) {
    errors.push(`"sizes" must be an array of strings`);
  }
  if (typeof raw.minDuration === 'number' && typeof raw.maxDuration === 'number' && raw.minDuration > raw.maxDuration) {
    errors.push(`"minDuration" must be less than or equal to "maxDuration"`);
  }

  if (errors.length) throw new ConfigError(`Invalid shipreel config in ${source}:\n  - ${errors.join('\n  - ')}`);
  return raw as ShipreelConfigFile;
}

export interface LoadConfigOptions {
  cwd?: string;
  /** Explicit path to a config JSON file. */
  configPath?: string;
  /** Values that override the file (e.g. CLI flags). Undefined values are ignored. */
  overrides?: ShipreelConfigFile;
}

/**
 * Load configuration from (in order of precedence): overrides, `configPath`,
 * `shipreel.config.json`, the `shipreel` key of package.json, built-in defaults.
 */
export function loadConfig(options: LoadConfigOptions = {}): ResolvedConfig {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const pkg = readPackageJson(cwd);
  let file: ShipreelConfigFile = {};
  let source = 'defaults';
  let baseDir = cwd;

  const candidate = options.configPath ? path.resolve(cwd, options.configPath) : path.join(cwd, 'shipreel.config.json');
  if (existsSync(candidate)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(candidate, 'utf8'));
    } catch (error) {
      throw new ConfigError(`Could not parse ${candidate}: ${(error as Error).message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConfigError(`${candidate} must contain a JSON object`);
    file = validate(parsed as Record<string, unknown>, candidate);
    source = candidate;
    baseDir = path.dirname(candidate);
  } else if (options.configPath) {
    throw new ConfigError(`Config file not found: ${candidate}`);
  } else if (pkg?.shipreel) {
    file = validate(pkg.shipreel as Record<string, unknown>, `${path.join(cwd, 'package.json')} ("shipreel" key)`);
    source = path.join(cwd, 'package.json');
  }

  const overrides = Object.fromEntries(
    Object.entries(options.overrides ?? {}).filter(([, v]) => v !== undefined && v !== ''),
  ) as ShipreelConfigFile;
  if (Object.keys(overrides).length) validate(overrides as Record<string, unknown>, 'command line options');
  const merged: ShipreelConfigFile = { ...file, ...overrides };
  // Paths given on the command line are relative to cwd, file paths to the config file.
  const resolvePath = (key: keyof ShipreelConfigFile) => {
    const value = merged[key];
    if (typeof value !== 'string' || !value) return undefined;
    return path.resolve(key in overrides ? cwd : baseDir, value);
  };

  const template = merged.template ?? DEFAULTS.template;
  const isTemplatePath = /[\\/]/.test(template) || template.startsWith('.');
  const repo = merged.repo ?? repoFromUrl(typeof pkg?.repository === 'string' ? pkg.repository : pkg?.repository?.url);
  const name = merged.name ?? pkg?.name;
  const url = merged.url ?? pkg?.homepage;

  let cta = merged.cta;
  if (cta === undefined) {
    if (pkg?.name && !pkg.private) cta = `npm i ${pkg.name}@latest`;
    else if (url) cta = url.replace(/^https?:\/\//, '');
    else if (repo) cta = `github.com/${repo}`;
  }

  const minDuration = merged.minDuration ?? DEFAULTS.minDuration;
  const maxDuration = merged.maxDuration ?? DEFAULTS.maxDuration;
  if (minDuration > maxDuration) throw new ConfigError('"minDuration" must be less than or equal to "maxDuration"');

  const resolved: ResolvedConfig = {
    template: isTemplatePath ? path.resolve('template' in overrides ? cwd : baseDir, template) : template,
    sizes: parseSizes(merged.sizes ?? [...DEFAULTS.sizes]),
    ctaSecondary: merged.ctaSecondary ?? DEFAULTS.ctaSecondary,
    maxItems: merged.maxItems ?? DEFAULTS.maxItems,
    maxChars: merged.maxChars ?? DEFAULTS.maxChars,
    fps: merged.fps ?? DEFAULTS.fps,
    outDir: resolvePath('outDir') ?? path.resolve(cwd, DEFAULTS.outDir),
    minDuration,
    maxDuration,
    source,
  };
  if (name) resolved.name = name;
  if (merged.brandColor) resolved.brandColor = merged.brandColor;
  if (merged.font) resolved.font = merged.font;
  if (cta) resolved.cta = cta;
  if (url) resolved.url = url;
  if (repo) resolved.repo = repo;
  if (merged.changelog) resolved.changelog = resolvePath('changelog');
  const logo = resolvePath('logo');
  if (logo) resolved.logo = logo;
  const music = resolvePath('music');
  if (music) resolved.music = music;
  return resolved;
}
