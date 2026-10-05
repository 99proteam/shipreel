#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Command, Option } from 'commander';
import { loadConfig, type ResolvedConfig, type ShipreelConfigFile } from './config.js';
import { loadLocalRelease, loadRelease, type LoadedRelease } from './input.js';
import { buildPlan, type VideoPlan } from './plan.js';
import { startPreview } from './preview/index.js';
import { renderVideos, type RenderProgress } from './render/render.js';
import { packageRoot } from './render/template.js';

interface CommonOptions {
  changelog?: string;
  notes?: string;
  version?: string;
  release?: string;
  repo?: string;
  config?: string;
  template?: string;
  sizes?: string;
  name?: string;
  brandColor?: string;
  cta?: string;
  fps?: number;
  maxItems?: number;
}

interface RenderCliOptions extends CommonOptions {
  out?: string;
  dryRun?: boolean;
  json?: boolean;
}

interface PreviewCliOptions extends CommonOptions {
  port: number;
  open: boolean;
}

function cliVersion(): string {
  try {
    return (JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

function addCommonOptions(command: Command): Command {
  return command
    .option('-c, --changelog <file>', 'CHANGELOG.md to read (default: ./CHANGELOG.md)')
    .option('--notes <file>', 'plain markdown release notes file')
    .option('--version <version>', 'release version to pick from the changelog (default: latest)')
    .option('--release <tag>', 'fetch notes of a GitHub release ("latest" works too); token from GITHUB_TOKEN')
    .option('--repo <owner/name>', 'GitHub repository for --release')
    .option('--config <file>', 'config file (default: shipreel.config.json or "shipreel" in package.json)')
    .option('-t, --template <name|path>', 'minimal, terminal, bold or a path to a custom template folder')
    .option('-s, --sizes <list>', 'comma-separated sizes: landscape,square,vertical or WIDTHxHEIGHT')
    .option('--name <name>', 'project name shown in the video')
    .option('--brand-color <hex>', 'brand color, e.g. #6d28d9')
    .option('--cta <text>', 'call to action in the outro, e.g. "npm i mylib@latest"')
    .addOption(new Option('--fps <n>', 'frames per second').argParser((v) => Number.parseInt(v, 10)))
    .addOption(new Option('--max-items <n>', 'maximum highlight scenes').argParser((v) => Number.parseInt(v, 10)));
}

function overridesFrom(options: CommonOptions & { out?: string }): ShipreelConfigFile {
  return {
    template: options.template,
    sizes: options.sizes,
    name: options.name,
    brandColor: options.brandColor,
    cta: options.cta,
    fps: options.fps,
    maxItems: options.maxItems,
    outDir: options.out,
    repo: options.repo,
  };
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? undefined;
}

function projectNameHint(config: ResolvedConfig): string | undefined {
  return config.repo?.split('/')[1];
}

function describePlan(plan: VideoPlan, source: string): string {
  const { content, timeline } = plan;
  const lines = [
    `shipreel: ${content.projectName} ${/^\d/.test(content.version) ? 'v' : ''}${content.version} (from ${source})`,
    `  template ${plan.template.name}, ${timeline.durationSeconds.toFixed(1)}s, ${timeline.fps} fps, ${timeline.scenes.length} scenes`,
    ...content.highlights.map((h, i) => `  ${i + 1}. [${h.kind}] ${h.text}`),
  ];
  if (content.fixCount > 0) lines.push(`  + ${content.fixCount} ${content.highlightsAreFixes ? 'more fixes' : 'bug fixes'}`);
  return lines.join('\n');
}

function progressReporter(): (p: RenderProgress) => void {
  const tty = Boolean(process.stderr.isTTY);
  let lastBucket = -1;
  return ({ size, frame, totalFrames }) => {
    const ratio = frame / totalFrames;
    const dims = `${size.width}x${size.height}`;
    const label = `  rendering ${size.name === dims ? dims : `${size.name} ${dims}`}`;
    if (tty) {
      const width = 24;
      const filled = Math.round(ratio * width);
      process.stderr.write(`\r${label} [${'#'.repeat(filled)}${' '.repeat(width - filled)}] ${Math.round(ratio * 100)}%`);
      if (frame === totalFrames) process.stderr.write('\n');
    } else {
      const bucket = Math.floor(ratio * 4);
      if (bucket !== lastBucket || frame === totalFrames) {
        lastBucket = bucket;
        process.stderr.write(`${label} ${Math.round(ratio * 100)}%\n`);
      }
    }
  };
}

async function runRender(options: RenderCliOptions): Promise<void> {
  const config = loadConfig({ configPath: options.config, overrides: overridesFrom(options) });
  const loaded: LoadedRelease = await loadRelease({
    changelog: options.changelog ?? config.changelog,
    notes: options.notes,
    version: options.version,
    release: options.release,
    repo: options.repo ?? config.repo,
    token: token(),
  });
  const plan = buildPlan(loaded.release, config, { projectName: projectNameHint(config) });

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ content: plan.content, timeline: plan.timeline, sizes: config.sizes }, null, 2)}\n`);
    return;
  }

  if (!options.json) process.stderr.write(`${describePlan(plan, loaded.source)}\n`);
  const started = Date.now();
  const videos = await renderVideos(plan, { onProgress: options.json ? undefined : progressReporter() });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(videos.map((v) => ({ file: v.file, size: v.size, durationSeconds: v.durationSeconds })), null, 2)}\n`);
    return;
  }
  process.stderr.write(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s:\n`);
  for (const video of videos) process.stdout.write(`${path.relative(process.cwd(), video.file) || video.file}\n`);
}

async function runPreview(options: PreviewCliOptions): Promise<void> {
  let remote: LoadedRelease | undefined;
  if (options.release) {
    const config = loadConfig({ configPath: options.config, overrides: overridesFrom(options) });
    remote = await loadRelease({ release: options.release, repo: options.repo ?? config.repo, token: token() });
  }
  const getPlan = () => {
    const config = loadConfig({ configPath: options.config, overrides: overridesFrom(options) });
    const loaded =
      remote ?? loadLocalRelease({ changelog: options.changelog ?? config.changelog, notes: options.notes, version: options.version });
    return buildPlan(loaded.release, config, { projectName: projectNameHint(config) });
  };
  const server = await startPreview({ getPlan, port: options.port, open: options.open });
  process.stderr.write(`${describePlan(getPlan(), remote?.source ?? 'local files')}\n\nPreview running at ${server.url}  (Ctrl+C to stop)\n`);
  const stop = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const program = new Command();
program
  .name('shipreel')
  .description('Turn release notes into a short announcement video for X, LinkedIn, Instagram and YouTube Shorts.')
  .version(cliVersion(), '-V, --cli-version', 'print the shipreel version')
  .showHelpAfterError();

addCommonOptions(
  program
    .command('render', { isDefault: true })
    .description('render announcement videos (default command)')
    .option('-o, --out <dir>', 'output directory (default: ./videos)')
    .option('--dry-run', 'print the selected highlights and timing as JSON without rendering')
    .option('--json', 'print rendered files as JSON'),
).action((options: RenderCliOptions) => runRender(options));

addCommonOptions(
  program
    .command('preview')
    .description('open a local page to preview the scenes before rendering')
    .addOption(new Option('-p, --port <port>', 'port').default(4848).argParser((v) => Number.parseInt(v, 10)))
    .option('--no-open', 'do not open the browser automatically'),
).action((options: PreviewCliOptions) => runPreview(options));

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\nshipreel: ${message}\n`);
  process.exit(1);
});
