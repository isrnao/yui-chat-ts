// テスト専用: GitHub Pages相当のdirectory index / slash redirect / static 404を再現する。
// ViteのSPA fallbackを使わず、配信対象はdist内のファイルだけ。
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { argv } from 'node:process';

const root = resolve(import.meta.dirname, '../../../dist');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/__fixture__/health') {
    response.writeHead(204).end();
    return;
  }
  let file;
  let status = 200;
  try {
    file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error('outside dist');
    if (statSync(file).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      file = resolve(file, 'index.html');
    }
    if (!statSync(file).isFile()) throw new Error('missing file');
  } catch {
    file = resolve(root, '404.html');
    status = 404;
  }
  const body = readFileSync(file);
  response.writeHead(status, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Content-Length': body.byteLength,
    'Cache-Control': 'no-store',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
});
server.listen(Number(argv[2] ?? 4181), '127.0.0.1');
