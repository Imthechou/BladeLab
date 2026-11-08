import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.png': 'image/png',
};
const allowed = new Set(Object.keys(mime));
const port = Number(process.env.PORT || 8217);

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    const extension = extname(file);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !allowed.has(extension)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extension], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`BladeLab http://127.0.0.1:${port}/`));
