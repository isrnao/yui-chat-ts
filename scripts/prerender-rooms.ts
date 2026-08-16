/**
 * ビルド後プリレンダ: dist/index.html をテンプレートに、enabled な各部屋の
 * 静的 HTML (dist/chat/<id>/index.html) を生成する。
 *
 * 実行: `node --experimental-strip-types scripts/prerender-rooms.ts`
 * (pnpm build:prod で vite build の後に実行される)
 *
 * GitHub Pages はディレクトリの index.html を HTTP 200 で配信するため、
 * これにより部屋ページのディープリンクが 404 ではなく 200 + 部屋固有メタで
 * 返るようになる (.kiro/specs/seo-improvement Req 1 / SEO-01)。
 * 生成ロジック本体は src/shared/utils/prerenderHtml.ts (vitest でテスト)。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { renderRoomHtml, buildOutputRelativePath } from '../src/shared/utils/prerenderHtml.ts';
import { CHAT_ROOMS, getListableRoomIds } from '../src/features/chat/rooms.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');
const templatePath = resolve(distDir, 'index.html');

if (!existsSync(templatePath)) {
  console.error(`✖ ${templatePath} がありません。先に vite build を実行してください。`);
  exit(1);
}

const template = readFileSync(templatePath, 'utf-8');

// enabled な全部屋 + 全部屋まとめビュー ('all')
const targets = [...getListableRoomIds().filter((id) => CHAT_ROOMS[id].enabled), 'all' as const];

let count = 0;
for (const roomId of targets) {
  const html = renderRoomHtml(template, roomId);
  const outPath = resolve(distDir, buildOutputRelativePath(roomId));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf-8');
  count += 1;
}

console.log(`✔ prerendered ${count} room pages → ${distDir}/chat/<id>/index.html`);
