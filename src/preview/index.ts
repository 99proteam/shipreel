import { spawn } from 'node:child_process';
import type { VideoPlan } from '../plan.js';
import { startSceneServer, type SceneServer } from '../server.js';

export interface PreviewOptions {
  /** Rebuilds the plan; called on every request so edits show up after a reload. */
  getPlan: () => VideoPlan;
  port?: number;
  open?: boolean;
}

export function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command as string, args as string[], { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // Opening a browser is best effort; the URL is printed anyway.
  }
}

/** Start the local preview server (scenes play in the browser exactly as they will be rendered). */
export async function startPreview(options: PreviewOptions): Promise<SceneServer> {
  options.getPlan(); // fail fast on config / input errors
  const server = await startSceneServer({ getPlan: options.getPlan, port: options.port ?? 4848, preview: true });
  if (options.open !== false) openInBrowser(server.url);
  return server;
}
