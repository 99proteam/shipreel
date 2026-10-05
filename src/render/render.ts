import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Browser, CDPSession, Page } from 'playwright';
import type { VideoPlan } from '../plan.js';
import { startSceneServer } from '../server.js';
import type { SizeSpec } from '../types.js';
import { launchBrowser } from './browser.js';
import { startEncoder } from './encode.js';

export interface RenderProgress {
  size: SizeSpec;
  frame: number;
  totalFrames: number;
}

export interface RenderOptions {
  /** Output directory. Defaults to config.outDir. */
  outDir?: string;
  /** Sizes to render. Defaults to config.sizes. */
  sizes?: SizeSpec[];
  onProgress?: (progress: RenderProgress) => void;
  /** Reuse an existing browser (it will not be closed). */
  browser?: Browser;
  /** JPEG quality of captured frames (1-100). Default 92. */
  frameQuality?: number;
}

export interface RenderedVideo {
  size: SizeSpec;
  file: string;
  frames: number;
  durationSeconds: number;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'release';
}

export function videoFileName(plan: VideoPlan, size: SizeSpec): string {
  const version = plan.content.version.replace(/[^0-9A-Za-z.+-]+/g, '-');
  return `${slugify(plan.content.projectName)}-${/^\d/.test(version) ? 'v' : ''}${version}-${size.name}.mp4`;
}

async function prepareScene(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __shipreelReady?: boolean }).__shipreelReady === true);
  await page.evaluate(async () => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 10_000));
    const images = Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
    await Promise.race([Promise.all([document.fonts.ready, images]), timeout]);
  });
}

async function capture(page: Page, cdp: CDPSession | undefined, quality: number): Promise<Buffer> {
  if (cdp) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  }
  return page.screenshot({ type: 'jpeg', quality, animations: 'allow', caret: 'hide' });
}

async function renderSize(browser: Browser, baseUrl: string, plan: VideoPlan, size: SizeSpec, file: string, options: RenderOptions) {
  const { timeline } = plan;
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let cdp: CDPSession | undefined;
  try {
    cdp = await context.newCDPSession(page);
  } catch {
    cdp = undefined;
  }
  const encoder = startEncoder({
    file,
    fps: timeline.fps,
    durationSeconds: timeline.durationSeconds,
    ...(plan.config.music ? { music: plan.config.music } : {}),
  });
  const quality = options.frameQuality ?? 92;
  let frame = 0;
  try {
    for (const [index, scene] of timeline.scenes.entries()) {
      await prepareScene(page, `${baseUrl}/scene/${encodeURIComponent(size.name)}/${index}`);
      for (let f = 0; f < scene.frames; f++) {
        const ms = (f / timeline.fps) * 1000;
        await page.evaluate((t) => (window as unknown as { __shipreelSeek: (ms: number) => number }).__shipreelSeek(t), ms);
        await encoder.write(await capture(page, cdp, quality));
        frame++;
        options.onProgress?.({ size, frame, totalFrames: timeline.totalFrames });
      }
    }
    await encoder.end();
  } catch (error) {
    encoder.abort();
    throw error;
  } finally {
    await context.close();
  }
  return { size, file, frames: frame, durationSeconds: frame / timeline.fps };
}

/**
 * Render the plan to one MP4 per size. Each scene is loaded in headless Chromium, every
 * animation is paused and seeked to the frame time, and the screenshot is piped to ffmpeg.
 */
export async function renderVideos(plan: VideoPlan, options: RenderOptions = {}): Promise<RenderedVideo[]> {
  const outDir = path.resolve(options.outDir ?? plan.config.outDir);
  mkdirSync(outDir, { recursive: true });
  const sizes = options.sizes ?? plan.config.sizes;
  const servedPlan: VideoPlan = { ...plan, config: { ...plan.config, sizes } };
  const server = await startSceneServer({ getPlan: () => servedPlan });
  const browser = options.browser ?? (await launchBrowser());
  const results: RenderedVideo[] = [];
  try {
    for (const size of sizes) {
      const file = path.join(outDir, videoFileName(plan, size));
      results.push(await renderSize(browser, server.url, plan, size, file, options));
    }
  } finally {
    if (!options.browser) await browser.close();
    await server.close();
  }
  return results;
}
