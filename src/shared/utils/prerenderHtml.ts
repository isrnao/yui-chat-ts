/**
 * 部屋ページのプリレンダ HTML を生成するコアロジック。
 *
 * scripts/prerender-rooms.ts (ビルド後に Node で実行) から呼ばれ、
 * dist/index.html をテンプレートに dist/chat/<id>/index.html の中身を作る。
 * Node 直接実行の import ツリーに入るため import.meta.env に依存しないこと
 * (roomSeo.ts と同じ制約)。
 */
import {
  buildRoomSeo,
  buildRoomPath,
  buildChanariRoomSeo,
  buildChanariPath,
  type RoomSeo,
} from './roomSeo.ts';
import { SITE_NAME } from './seo.ts';
import { type RoomId } from '../../features/chat/rooms.ts';
import { buildTwoShotSeo } from '../../features/two-shot-chat/seo.ts';

export const PAGE_SEO_START = '<!-- page-seo:start -->';
export const PAGE_SEO_END = '<!-- page-seo:end -->';
const ROOT_OPEN = '<div id="root">';
const HEAD_CLOSE = '</head>';

/**
 * その URL が使うルートチャンクを modulePreload させるタグを head に足す。
 *
 * ルート単位の code splitting により、ルート本体は index チャンクの実行後に
 * 動的 import される。何もしないとその 1 往復ぶん描画が遅れるため、
 * ビルドマニフェストから解決したチャンクを先読みさせる
 * (.kiro/specs/top-and-transition-performance Requirement 2.5)。
 */
export function injectRoutePreload(html: string, assetPaths: readonly string[]): string {
  if (assetPaths.length === 0) return html;

  const headIndex = html.indexOf(HEAD_CLOSE);
  if (headIndex === -1) {
    throw new Error('prerender: </head> が見つかりません');
  }

  const tags = assetPaths
    // テンプレートが既に参照しているもの (エントリ JS / 共通 CSS など) は足さない
    .filter((path) => !html.includes(`/${path}`))
    .map((path) =>
      path.endsWith('.css')
        ? // CSS に modulePreload は使えない。ルート固有 CSS は stylesheet として
          // 先に当てて FOUC を避ける
          `<link rel="stylesheet" crossorigin href="/${path}" />`
        : `<link rel="modulePreload" crossorigin href="/${path}" />`
    )
    .join('');

  if (tags === '') return html;

  return html.replace(HEAD_CLOSE, `${tags}${HEAD_CLOSE}`);
}

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

  const tags = [
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
  ];

  // ページ固有の構造化データ (WebPage + BreadcrumbList)。
  // ランタイムでは useSEO が同じ data-page-jsonld ノードを同値で上書きする。
  // jsonLd を持たないページ (なりきり) では useSEO がこのノードを削除するため、
  // ここでも出さない。出すと hydrate 直後に消える不一致になる。
  // "<" は Unicode エスケープ (バックスラッシュ + u003c) に置換し、値に "</script>" が
  // 紛れても HTML が壊れないようにする
  // (JSON としては等価なので JSON.parse の結果は変わらない)
  if (seo.jsonLd.length > 0) {
    tags.push(
      `<script type="application/ld+json" data-page-jsonld>${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>`
    );
  }

  return tags.join('\n    ');
}

/**
 * SSG 済みの HTML を #root に流し込み、hydrate 対象であることを示す印を付ける。
 *
 * `data-ssg="1"` はクライアント (main.tsx) が hydrateRoot / createRoot を
 * 出し分けるための目印。SSG していないページへ誤って hydrate すると
 * マークアップ不一致になるため、印のあるページだけ hydrate する。
 */
export function injectSsgMarkup(html: string, markup: string): string {
  const rootIndex = html.indexOf(ROOT_OPEN);
  if (rootIndex === -1) {
    throw new Error('prerender: #root が見つかりません');
  }
  return html.replace(ROOT_OPEN, `<div id="root" data-ssg="1">${markup}`);
}

/**
 * テンプレート (dist/index.html) の page-seo マーカー範囲を、渡された SEO で差し替える。
 * マーカーや #root が見つからない場合は throw してビルドを失敗させる
 * (壊れた HTML を黙って配信しないため)。
 */
function renderPageHtml(template: string, seo: RoomSeo): string {
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

  const head =
    template.slice(0, startIndex) +
    `${PAGE_SEO_START}\n    ` +
    buildHeadBlock(seo) +
    `\n    ${PAGE_SEO_END}` +
    template.slice(endIndex + PAGE_SEO_END.length);

  // #root の中身は SSG (injectSsgMarkup) が埋める。
  // 以前はここで手書きの静的フォールバックを入れていたが、SSG はクライアントと
  // 同一のマークアップを出すため、そちらに一本化した (二重表示とレイアウトシフトを避ける)。
  return head;
}

/** テンプレートから通常チャット部屋ページ (`/chat/<id>`) の HTML を生成する。 */
export function renderRoomHtml(template: string, roomId: RoomId): string {
  return renderPageHtml(template, buildRoomSeo(roomId));
}

/**
 * テンプレートからなりきり部屋ページ (`/chanari/<id>`) の HTML を生成する。
 *
 * これを出さないと GitHub Pages が `/chanari/<id>` に 404.html を返し、
 * SPA リダイレクトハックで `/?/chanari/<id>` (= トップの index.html) を
 * 読み込むことになる。結果としてトップが一度描画され、hydrate も
 * マークアップ不一致で失敗する。
 */
export function renderChanariRoomHtml(template: string, roomId: RoomId): string {
  return renderPageHtml(template, buildChanariRoomSeo(roomId));
}

/**
 * テンプレートからツーショットチャットのページ (`/chat/2shot/`) の HTML を生成する。
 * head は TwoShotPage の useSEO と同じ buildTwoShotSeo の入口の値にする (SSG は常に入口を描くため)。
 * 出力先は通常の部屋と同じ buildOutputRelativePath('2shot')。
 */
export function renderTwoShotHtml(template: string): string {
  return renderPageHtml(template, buildTwoShotSeo(null));
}

/**
 * 先読みする資産のうち、Supabase の SDK / クライアントのチャンクを返す。
 * vite.config.ts は @supabase/* をまとめて vendor-supabase にするので、ファイル名で見分けられる。
 * ツーショットチャットのルートは fetch だけで通信するので、これが空でなければビルドを止める
 * (.kiro/specs/two-shot-chat Requirement 17.5)。
 */
export function findSupabaseAssets(assetPaths: readonly string[]): string[] {
  return assetPaths.filter((path) => /supabase/i.test(path.slice(path.lastIndexOf('/') + 1)));
}

/** プリレンダ後の出力先 (dist からの相対パス)。 例: chat/anime/index.html */
export function buildOutputRelativePath(roomId: RoomId): string {
  return `${buildRoomPath(roomId).replace(/^\//, '')}index.html`;
}

/** なりきり側の出力先 (dist からの相対パス)。 例: chanari/durarara/index.html */
export function buildChanariOutputRelativePath(roomId: RoomId): string {
  return `${buildChanariPath(roomId).replace(/^\//, '')}index.html`;
}
