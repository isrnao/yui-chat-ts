// ローカルSSGの比較計測。実ユーザーINPや実バックエンドの接続性能とは区別する。
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { argv } from 'node:process';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const root = resolve(args.dist ?? 'dist');
const port = Number(args.port ?? 4182);
const origin = `http://127.0.0.1:${port}`;
const samples = Number(args.samples ?? 3);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  // 計測ビルドの接続先だけを空ログ/空人数で固定。本番へ書き込む経路はない。
  if (url.pathname.startsWith('/fixture/')) {
    response
      .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end('[]');
    return;
  }
  let file;
  try {
    file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${root}${sep}`) && file !== root) throw new Error('outside dist');
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
    const type = extname(file);
    const zipped = ['.js', '.css', '.html', '.svg'].includes(type);
    const raw = readFileSync(file);
    const body = zipped ? gzipSync(raw) : raw;
    response
      .writeHead(200, {
        'Content-Type': mime[type] ?? 'application/octet-stream',
        'Content-Length': body.byteLength,
        ...(zipped ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
        'Cache-Control': type === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      })
      .end(body);
  } catch {
    response.writeHead(404).end('Missing measurement file');
  }
});
server.on('upgrade', (_request, socket) => socket.destroy());
await new Promise((done) => server.listen(port, '127.0.0.1', done));
let browser;
const results = [];
try {
  browser = await chromium.launch();
  for (const path of ['/', '/chat/superbeginner/', '/chat/all/', '/chanari/superbeginner/']) {
    for (let sample = 1; sample <= samples; sample++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      });
      try {
        // fresh contextがcold、そのcontext内の2回目の文書ロードがwarm。
        // Playwright routeはHTTP cacheを無効にするため使わない。
        for (const cache of ['cold', 'warm']) {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.enable');
          await cdp.send('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] });
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 150,
            downloadThroughput: 200_000,
            uploadThroughput: 96_000,
          });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(() => {
            const metrics = {
              lcpMs: null,
              mainVisibleMs: null,
              inputEditableMs: null,
              submitEnabledMs: null,
              interactions: [],
            };
            window.measurement = metrics;
            new PerformanceObserver((list) => {
              metrics.lcpMs = list.getEntries().at(-1)?.startTime ?? null;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            const observeEvents = (list) => {
              for (const entry of list.getEntries()) {
                if (entry.interactionId)
                  metrics.interactions.push({
                    id: entry.interactionId,
                    duration: entry.duration,
                    inputDelay: entry.processingStart - entry.startTime,
                  });
              }
            };
            new PerformanceObserver(observeEvents).observe({
              type: 'event',
              buffered: true,
              durationThreshold: 16,
            });
            new PerformanceObserver(observeEvents).observe({ type: 'first-input', buffered: true });
            const visible = (element) => element && element.getBoundingClientRect().width > 0;
            const mark = () => {
              const input = document.querySelector('#root input[type="text"]');
              const submit = document.querySelector('form [type="submit"]');
              if (metrics.mainVisibleMs === null && visible(document.querySelector('#root main')))
                metrics.mainVisibleMs = performance.now();
              if (metrics.inputEditableMs === null && visible(input) && !input.disabled)
                metrics.inputEditableMs = performance.now();
              if (metrics.submitEnabledMs === null && visible(submit) && !submit.disabled)
                metrics.submitEnabledMs = performance.now();
              requestAnimationFrame(mark);
            };
            requestAnimationFrame(mark);
          });
          await page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 60_000 });
          await page.waitForLoadState('networkidle', { timeout: 60_000 });
          const initialJs = await page.evaluate(() =>
            performance
              .getEntriesByType('resource')
              .filter((entry) => /\.js(?:\?|$)/.test(entry.name))
              .reduce((sum, entry) => sum + entry.transferSize, 0)
          );
          if (path === '/') {
            // skip linkはTabで表示される。実際のキーボード導線を使う。
            await page.keyboard.press('Tab');
            await page.keyboard.press('Enter');
          } else {
            const input = page.getByRole('textbox', { name: 'おなまえ', exact: true });
            await input.click();
            await input.pressSequentially('perf', { delay: 30 });
          }
          await page.waitForLoadState('networkidle', { timeout: 60_000 });
          // Event Timingのbuffer通知と、次のpaintを待つ。
          await page.waitForTimeout(250);
          const metrics = await page.evaluate(() => {
            const js = performance
              .getEntriesByType('resource')
              .filter((entry) => /\.js(?:\?|$)/.test(entry.name));
            const timings = window.measurement.interactions;
            return {
              ...window.measurement,
              // 少数の操作における最大Event Timing。実ユーザーのINP p75ではない。
              labInteractionMs: timings.length
                ? Math.max(...timings.map((entry) => entry.duration))
                : null,
              inputDelayMs: timings.length
                ? Math.max(...timings.map((entry) => entry.inputDelay))
                : null,
              jsTransferBytes: js.reduce((sum, entry) => sum + entry.transferSize, 0),
              jsDecodedBytes: js.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
              cachedJs: js.filter((entry) => entry.transferSize === 0 && entry.decodedBodySize > 0)
                .length,
              jsResources: js.length,
              realtimeConnectedMs: null,
            };
          });
          const result = {
            path,
            sample,
            cache,
            initialJsTransferBytes: initialJs,
            ...metrics,
            errors,
          };
          results.push(result);
          console.log(
            JSON.stringify({
              label: args.label,
              path,
              sample,
              cache,
              lcp: metrics.lcpMs,
              input: metrics.inputEditableMs,
              js: metrics.jsTransferBytes,
              cachedJs: metrics.cachedJs,
            })
          );
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  }
  writeFileSync(
    args.output ?? resolve('web-platform-performance.json'),
    `${JSON.stringify({ label: args.label, timestamp: new Date().toISOString(), browser: browser.version(), conditions: { viewport: '390x844', cpuThrottle: 4, latencyMs: 150, downloadBytesPerSecond: 200_000, uploadBytesPerSecond: 96_000, tags: 'remote HTTPS/WSS blocked; local New Relic chunks retained', backend: 'local empty responses; no Realtime server', gzip: true, samples }, results }, null, 2)}\n`
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
