/**
 * `public/sitemap.xml` を `CHAT_ROOM_IDS` から自動生成する。
 *
 * 実行: `node --experimental-strip-types scripts/generate-sitemap.ts`
 * (Node 22.6+ で TS をそのまま実行できる。Node 23.6+ ではフラグなしで動作)
 *
 * - トップ (`/`) を固定エントリとして含める
 * - `/chat-log` は matchRoute に該当ルートが無く 404 になるため除外
 *   (service-improvement Req 2 でルート復活が確定したら戻す)
 * - enabled な全ルーム (`getListableRoomIds()`、`all` は含まない) を `/chat/<id>` で列挙し、
 *   全部屋まとめビュー `/chat/all` は固定エントリとして別途追加する
 * - `/chanari/<id>` は `/chat/<id>` と内容が重複するため除外 (canonical 化方針)
 * - `lastmod` / `changefreq` / `priority` は出力しない:
 *   changefreq / priority は Google が無視する死に要素、lastmod は
 *   「全 URL 一律のビルド日」しか出せず虚偽シグナルになるため省略
 *   (.kiro/specs/seo-improvement Req 3)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_ROOMS, getListableRoomIds } from '../src/features/chat/rooms.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://www.okiraku.chat';

const locs: string[] = [
  `${ORIGIN}/`,
  ...getListableRoomIds()
    .filter((id) => CHAT_ROOMS[id].enabled)
    .map((id) => `${ORIGIN}/chat/${id}`),
  // 全部屋まとめビュー (prerender 対象・固有メタあり)
  `${ORIGIN}/chat/all`,
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join('\n')}
</urlset>
`;

const outPath = resolve(__dirname, '../public/sitemap.xml');
writeFileSync(outPath, xml, 'utf-8');
console.log(`✔ sitemap.xml written (${locs.length} urls) → ${outPath}`);
