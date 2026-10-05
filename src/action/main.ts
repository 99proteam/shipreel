import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { getRelease, uploadReleaseAsset, fetchRelease, type GitHubRelease } from '../github.js';
import { loadLocalRelease, releaseFromGitHub } from '../input.js';
import { buildPlan } from '../plan.js';
import { renderVideos } from '../render/render.js';

/** Read an action input passed by action.yml as INPUT_<NAME> (dashes kept, like @actions/core). */
export function getInput(name: string): string {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  return (process.env[key] ?? process.env[key.replace(/-/g, '_')] ?? '').trim();
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    process.stdout.write(`${name}=${value}\n`);
    return;
  }
  const delimiter = `shipreel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
}

const log = (message: string) => process.stdout.write(`${message}\n`);

function eventRelease(): GitHubRelease | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return undefined;
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as { release?: GitHubRelease };
    return event.release;
  } catch {
    return undefined;
  }
}

async function run(): Promise<void> {
  const token = getInput('github-token') || process.env.GITHUB_TOKEN || '';
  const repo = process.env.GITHUB_REPOSITORY;
  const upload = !/^(false|0|no|off)$/i.test(getInput('upload') || 'true');
  const tagInput = getInput('tag');

  const config = loadConfig({
    configPath: getInput('config') || undefined,
    overrides: {
      template: getInput('template') || undefined,
      sizes: getInput('sizes') || undefined,
      outDir: getInput('output-dir') || undefined,
      repo: repo || undefined,
    },
  });

  let ghRelease = eventRelease();
  if (tagInput && repo) ghRelease = await fetchRelease(repo, tagInput, token);
  else if (!ghRelease && repo && !getInput('changelog')) ghRelease = await fetchRelease(repo, 'latest', token);

  const changelogInput = getInput('changelog');
  let release;
  let source: string;
  if (changelogInput) {
    const version = ghRelease?.tag_name ?? tagInput ?? undefined;
    const loaded = loadLocalRelease({ changelog: changelogInput, ...(version ? { version } : {}) });
    release = loaded.release;
    source = loaded.source;
  } else if (ghRelease) {
    release = releaseFromGitHub(ghRelease);
    source = `release ${ghRelease.tag_name}`;
  } else {
    throw new Error('No release found: run on a "release" event, pass the "tag" input, or set "changelog".');
  }

  const plan = buildPlan(release, config, { projectName: repo?.split('/')[1] });
  log(`shipreel: ${plan.content.projectName} ${plan.content.version} from ${source}`);
  plan.content.highlights.forEach((h, i) => log(`  ${i + 1}. [${h.kind}] ${h.text}`));
  if (plan.content.fixCount) log(`  + ${plan.content.fixCount} fixes`);

  let lastLogged = '';
  const videos = await renderVideos(plan, {
    onProgress: ({ size, frame, totalFrames }) => {
      const pct = Math.floor((frame / totalFrames) * 4) * 25;
      const key = `${size.name}:${pct}`;
      if (key !== lastLogged) {
        lastLogged = key;
        const dims = `${size.width}x${size.height}`;
        log(`  rendering ${size.name === dims ? dims : `${size.name} ${dims}`}: ${pct}%`);
      }
    },
  });

  const relative = videos.map((v) => path.relative(process.cwd(), v.file) || v.file);
  const urls: string[] = [];
  if (upload && ghRelease && repo) {
    if (!token) throw new Error('github-token is required to upload release assets');
    // Re-read the release so assets uploaded by a previous run are replaced, not duplicated.
    let fresh = await getRelease(repo, ghRelease.id, token);
    for (const video of videos) {
      const asset = await uploadReleaseAsset(repo, fresh, video.file, token);
      urls.push(asset.browser_download_url);
      log(`  uploaded ${path.basename(video.file)} -> ${asset.browser_download_url}`);
      fresh = await getRelease(repo, ghRelease.id, token);
    }
  } else if (upload) {
    log('  upload skipped: no GitHub release in context');
  }

  setOutput('videos', relative.join('\n'));
  setOutput('video', relative[0] ?? '');
  setOutput('videos-json', JSON.stringify(relative));
  setOutput('asset-urls', urls.join('\n'));

  summary(
    [
      `### 🎬 shipreel: ${plan.content.projectName} ${plan.content.version}`,
      '',
      ...plan.content.highlights.map((h) => `- **${h.kind}** ${h.text}`),
      plan.content.fixCount ? `- + ${plan.content.fixCount} fixes` : '',
      '',
      '| Size | File | Duration |',
      '| --- | --- | --- |',
      ...videos.map((v, i) => {
        const link = urls[i] ? `[${path.basename(v.file)}](${urls[i]})` : `\`${relative[i]}\``;
        return `| ${v.size.width}×${v.size.height} | ${link} | ${v.durationSeconds.toFixed(1)}s |`;
      }),
    ]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
  );
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`::error title=shipreel::${message.replace(/\r?\n/g, '%0A')}\n`);
  process.exit(1);
});
