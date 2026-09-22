import http from 'node:http';
import fs from 'node:fs';
const out = process.argv[2] ?? 'sink.jsonl';
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    fs.appendFileSync(out, JSON.stringify({ t: Date.now(), path: req.url, ct: req.headers['content-type'], body }) + '\n');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
}).listen(4318, () => console.log('sink on 4318'));
