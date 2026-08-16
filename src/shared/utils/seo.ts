/**
 * SEO用のメタデータ管理。
 * DOM 操作 (meta タグ等の更新) は useSEO に一本化されており、ここは定数と
 * 純関数のみを置く (Node 実行のプリレンダからも import されるため)。
 */

export const SITE_ORIGIN = 'https://www.okiraku.chat';

/**
 * サイト名の単一ソース。全ページの title / OGP / 構造化データはここを参照する。
 * 旧称「ゆいちゃっとTS」は構造化データの alternateName と本文中の言及にのみ残す
 * (.kiro/specs/seo-improvement Req 4)。
 */
export const SITE_NAME = 'お気楽チャットTS';

/**
 * ページ title を「{ページ名} | お気楽チャットTS」形式に統一する (Req 4.2)。
 * トップのみ「お気楽チャットTS - {キャッチコピー}」形式を許容し、その場合は使わない。
 */
export function buildPageTitle(pageName: string): string {
  return `${pageName} | ${SITE_NAME}`;
}

export function buildAbsoluteUrl(pathname = '/'): string {
  return new URL(pathname, `${SITE_ORIGIN}/`).toString();
}
