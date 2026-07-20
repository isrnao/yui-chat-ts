/**
 * 部屋ページのプリレンダ HTML を生成するコアロジック。
 *
 * scripts/prerender-rooms.ts (ビルド後に Node で実行) から呼ばれ、
 * dist/index.html をテンプレートに dist/chat/<id>/index.html の中身を作る。
 * Node 直接実行の import ツリーに入るため import.meta.env に依存しないこと
 * (roomSeo.ts と同じ制約)。
 */
import { buildRoomSeo, buildRoomPath, type RoomSeo } from './roomSeo.ts';
import { SITE_NAME } from './seo.ts';
import {
  getRoomMeta,
  getRelatedRooms,
  ROOM_CATEGORY_LABELS,
  type RoomId,
} from '../../features/chat/rooms.ts';

export const PAGE_SEO_START = '<!-- page-seo:start -->';
export const PAGE_SEO_END = '<!-- page-seo:end -->';
const ROOT_OPEN = '<div id="root">';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** page-seo マーカー範囲に入れる部屋固有の head ブロックを生成する */
function buildHeadBlock(seo: RoomSeo): string {
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const canonical = escapeHtml(seo.canonical);
  const ogImage = escapeHtml(seo.ogImage);

  return [
    `<title>${title}</title>`,
    `<meta name="title" content="${title}" />`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${title}" />`,
    `<meta property="og:locale" content="ja_JP" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    `<meta name="twitter:image:alt" content="${title}" />`,
    // ページ固有の構造化データ (WebPage + BreadcrumbList)。
    // ランタイムでは useSEO が同じ data-page-jsonld ノードを同値で上書きする。
    // "<" は Unicode エスケープ (バックスラッシュ + u003c) に置換し、値に "</script>" が
    // 紛れても HTML が壊れないようにする
    // (JSON としては等価なので JSON.parse の結果は変わらない)
    `<script type="application/ld+json" data-page-jsonld>${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
}

/**
 * #root に入れる静的フォールバック本文。
 * JS 非実行クローラ向け。React の CSR マウント時に同等の画面に置き換わる。
 * 構成 (h1 + 紹介文 + カテゴリ + 関連部屋リンク + トップへのリンク) は
 * RoomInfo コンポーネントと同じデータソース (rooms.ts) から導出しており一致する。
 */
function buildStaticFallback(roomId: RoomId): string {
  const room = getRoomMeta(roomId);
  const related = getRelatedRooms(roomId);
  const relatedLinks = related
    .map((r) => `<a href="${buildRoomPath(r.id)}">${escapeHtml(r.title)}</a>`)
    .join('／');

  // カテゴリ名は RoomInfo と同様、関連部屋の有無に関わらず常に出す
  const categoryLine =
    `<p>カテゴリ: ${escapeHtml(ROOM_CATEGORY_LABELS[room.category])}` +
    (related.length > 0 ? ` ／ 他の部屋: ${relatedLinks}` : '') +
    '</p>';

  return [
    '<main>',
    `<h1>${escapeHtml(room.title)}</h1>`,
    `<p>${escapeHtml(buildRoomSeo(roomId).description)}</p>`,
    categoryLine,
    `<p><a href="/">${escapeHtml(SITE_NAME)} トップページへ</a></p>`,
    '</main>',
  ].join('');
}

/**
 * テンプレート (dist/index.html) から部屋ページの HTML を生成する。
 * マーカーや #root が見つからない場合は throw してビルドを失敗させる
 * (壊れた HTML を黙って配信しないため)。
 */
export function renderRoomHtml(template: string, roomId: RoomId): string {
  const startIndex = template.indexOf(PAGE_SEO_START);
  const endIndex = template.indexOf(PAGE_SEO_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `page-seo markers not found in template. index.html の ${PAGE_SEO_START} / ${PAGE_SEO_END} を確認してください。`
    );
  }

  const rootIndex = template.indexOf(ROOT_OPEN);
  if (rootIndex === -1) {
    throw new Error(`${ROOT_OPEN} not found in template.`);
  }

  const seo = buildRoomSeo(roomId);
  const head =
    template.slice(0, startIndex) +
    `${PAGE_SEO_START}\n    ` +
    buildHeadBlock(seo) +
    `\n    ${PAGE_SEO_END}` +
    template.slice(endIndex + PAGE_SEO_END.length);

  return head.replace(ROOT_OPEN, `${ROOT_OPEN}${buildStaticFallback(roomId)}`);
}

/** プリレンダ後の出力先 (dist からの相対パス)。 例: chat/anime/index.html */
export function buildOutputRelativePath(roomId: RoomId): string {
  return `${buildRoomPath(roomId).replace(/^\//, '')}/index.html`;
}
