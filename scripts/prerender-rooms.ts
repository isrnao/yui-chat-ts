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
import {
  renderRoomHtml,
  buildOutputRelativePath,
  injectRoutePreload,
} from '../src/shared/utils/prerenderHtml.ts';
import { CHAT_ROOMS, getListableRoomIds } from '../src/features/chat/rooms.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');
const templatePath = resolve(distDir, 'index.html');

if (!existsSync(templatePath)) {
  console.error(`✖ ${templatePath} がありません。先に vite build を実行してください。`);
  exit(1);
}

const template = readFileSync(templatePath, 'utf-8');

/**
 * ルートチャンクとその静的依存を manifest から解決する。
 * 部屋ページは ChatRoute (all は AllRoomsRoute) を使う。
 */
const manifestPath = resolve(distDir, '.vite/manifest.json');
type ManifestEntry = { file: string; css?: string[]; imports?: string[] };
const manifest: Record<string, ManifestEntry> = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, ManifestEntry>)
  : {};

function resolveChunkPaths(entryKey: string): string[] {
  const seen = new Set<string>();
  const walk = (key: string) => {
    const entry = manifest[key];
    if (!entry || seen.has(key)) return;
    seen.add(key);
    for (const dep of entry.imports ?? []) walk(dep);
  };
  walk(entryKey);
  return [...seen].flatMap((key) => {
    const entry = manifest[key];
    return entry ? [entry.file, ...(entry.css ?? [])] : [];
  });
}

// enabled な全部屋 + 全部屋まとめビュー ('all')
const targets = [...getListableRoomIds().filter((id) => CHAT_ROOMS[id].enabled), 'all' as const];

let count = 0;
for (const roomId of targets) {
  const routeKey = roomId === 'all' ? 'src/routes/AllRoomsRoute.tsx' : 'src/routes/ChatRoute.tsx';
  const html = injectRoutePreload(renderRoomHtml(template, roomId), resolveChunkPaths(routeKey));
  const outPath = resolve(distDir, buildOutputRelativePath(roomId));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf-8');
  count += 1;
}

// トップは静的 import なのでエントリの依存として既に modulePreload されている。
// 先読みを追加する必要はない。

console.log(`✔ prerendered ${count} room pages → ${distDir}/chat/<id>/index.html`);
