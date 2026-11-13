// @ts-check
/**
 * Zero-dependency static server for local development.
 * Usage: node tools/serve.mjs [port]      (default 5173, or the PORT variable)
 * Serves the repository root on 127.0.0.1 only.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = '127.0.0.1';

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @param {string} urlPath
 * @returns {string | null} Absolute file path inside ROOT, or null if the path escapes it.
 */
function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const target = resolve(join(ROOT, normalize(decoded)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

/**
 * @param {number} [port] 0 picks a free port.
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export function startServer(port = 5173) {
  const server = createServer(async (req, res) => {
    /**
     * @param {number} code
     * @param {string} text
     */
    const plain = (code, text) => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      plain(405, 'Method not allowed');
      return;
    }
    const { pathname } = new URL(req.url ?? '/', `http://${HOST}`);
    let file = resolvePath(pathname);
    if (file === null) {
      plain(403, 'Forbidden');
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      plain(404, 'Not found');
    }
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, HOST, () => {
      const address = server.address();
      const actual = typeof address === 'object' && address ? address.port : port;
      ok({
        url: `http://${HOST}:${actual}/`,
        port: actual,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const wanted = Number(process.argv[2] ?? process.env.PORT ?? 5173);
  if (!Number.isInteger(wanted) || wanted < 0 || wanted > 65535) {
    console.error(`Invalid port: ${process.argv[2] ?? process.env.PORT}`);
    process.exit(1);
  }
  startServer(wanted).then(
    ({ url }) => console.log(`Café Shift is being served at ${url}  (Ctrl+C to stop)`),
    (error) => {
      console.error(`Could not start the server: ${error.message}`);
      process.exit(1);
    },
  );
}
