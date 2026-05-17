/**
 * `public/sitemap.xml` を `CHAT_ROOM_IDS` から自動生成する。
 *
 * 実行: `node --experimental-strip-types scripts/generate-sitemap.ts`
 * (Node 22.6+ で TS をそのまま実行できる。Node 23.6+ ではフラグなしで動作)
 *
 * - トップ (`/`) と `/chat-log` を固定エントリとして含める
 * - `CHAT_ROOM_IDS` のうち enabled な全ルームを `/chat/<id>` で列挙
 * - `/chanari/<id>` は `/chat/<id>` と内容が重複するため除外 (canonical 化方針)
 * - `lastmod` は実行日 (YYYY-MM-DD)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_ROOMS, CHAT_ROOM_IDS } from '../src/features/chat/rooms.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://www.okiraku.chat';
const today = new Date().toISOString().slice(0, 10);

type Entry = { loc: string; changefreq: string; priority: string };

const entries: Entry[] = [
  { loc: `${ORIGIN}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${ORIGIN}/chat-log`, changefreq: 'weekly', priority: '0.3' },
  ...CHAT_ROOM_IDS.filter((id) => CHAT_ROOMS[id].enabled).map((id) => ({
    loc: `${ORIGIN}/chat/${id}`,
    changefreq: 'daily',
    priority: '0.7',
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`;

const outPath = resolve(__dirname, '../public/sitemap.xml');
writeFileSync(outPath, xml, 'utf-8');
console.log(`✔ sitemap.xml written (${entries.length} urls) → ${outPath}`);
