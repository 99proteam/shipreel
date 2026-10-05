import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { VideoPlan } from './plan.js';
import { renderSceneDocument } from './render/scene.js';
import { previewPage } from './preview/page.js';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json',
};

export interface SceneServerOptions {
  /** Called on every request so the preview reflects edits to templates and config. */
  getPlan: () => VideoPlan;
  port?: number;
  host?: string;
  /** Serve the interactive preview page at "/". */
  preview?: boolean;
}

export interface SceneServer {
  url: string;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

/** Local HTTP server that serves scene documents and template assets to Chromium (and the preview UI). */
export async function startSceneServer(options: SceneServerOptions): Promise<SceneServer> {
  const host = options.host ?? '127.0.0.1';

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (parts[0] === 'scene' && parts.length === 3) {
        const plan = options.getPlan();
        const size = plan.config.sizes.find((s) => s.name === parts[1]);
        if (!size) return send(res, 404, `Unknown size ${parts[1]}`);
        const html = renderSceneDocument(plan, size, Number(parts[2]), { assetBase: '/template/' });
        return send(res, 200, html, 'text/html; charset=utf-8');
      }
      if (parts[0] === 'template') {
        const plan = options.getPlan();
        const root = path.resolve(plan.template.dir);
        const file = path.resolve(root, ...parts.slice(1));
        if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');
        res.writeHead(200, {
          'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        createReadStream(file).pipe(res);
        return;
      }
      if (options.preview && url.pathname === '/plan.json') {
        const plan = options.getPlan();
        const body = {
          content: plan.content,
          timeline: plan.timeline,
          sizes: plan.config.sizes,
          template: plan.template.name,
          brandColor: plan.brandColor,
        };
        return send(res, 200, JSON.stringify(body), 'application/json');
      }
      if (options.preview && url.pathname === '/') return send(res, 200, previewPage(), 'text/html; charset=utf-8');
      return send(res, 404, 'Not found');
    } catch (error) {
      return send(res, 500, (error as Error).message);
    }
  };

  const server = createServer(handle);
  server.listen(options.port ?? 0, host);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
