import { chromium, type Browser } from 'playwright';

const ARGS = ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars', '--mute-audio'];

/**
 * Launch headless Chromium. Falls back to an installed Chrome or Edge when the
 * Playwright browser has not been downloaded yet.
 */
export async function launchBrowser(): Promise<Browser> {
  const errors: string[] = [];
  const executablePath = process.env.SHIPREEL_CHROMIUM;
  const attempts: Array<Parameters<typeof chromium.launch>[0]> = executablePath
    ? [{ executablePath }]
    : [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, args: ARGS, ...attempt });
    } catch (error) {
      errors.push((error as Error).message.split('\n')[0] ?? String(error));
    }
  }
  throw new Error(
    `Could not launch Chromium. Install it with:\n\n  npx playwright install chromium\n\n(on Linux CI: npx playwright install --with-deps chromium)\n\nDetails:\n  ${errors.join('\n  ')}`,
  );
}
