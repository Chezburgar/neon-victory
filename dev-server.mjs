import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.png': 'image/png'
};

createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p.includes('..')) { res.writeHead(400); res.end(); return; }
  try {
    const f = await readFile(join(root, p));
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(f);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(8409, () => console.log('serving on http://localhost:8409'));
