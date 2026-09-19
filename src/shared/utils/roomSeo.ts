/**
 * 部屋ページの SEO メタ一式を導出する単一ソース。
 *
 * ランタイム (useSEO) とビルド後プリレンダ (scripts/prerender-rooms.ts) の両方が
 * この関数を使うことで、静的 HTML と SPA のメタタグが常に一致することを保証する
 * (.kiro/specs/seo-improvement design §1)。
 *
 * Node 直接実行 (node --experimental-strip-types) から import されるため、
 * - import.meta.env に依存しない (routing.ts は BASE_URL 参照のため import 不可)
 * - import は相対パス + .ts 拡張子 (path alias は Node で解決されない)
 * という制約を守ること。パスは vite.config.ts の base: '/' を前提に固定形で組み立てる。
 */
import { SITE_ORIGIN, SITE_NAME, buildAbsoluteUrl, buildPageTitle } from './seo.ts';
import { getRoomMeta, ROOM_CATEGORY_LABELS, type RoomId } from '../../features/chat/rooms.ts';

export type RoomSeo = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  /** WebPage + BreadcrumbList。<script type="application/ld+json" data-page-jsonld> に入れる */
  jsonLd: object[];
};

export type RoomSeoOverrides = {
  /** 呼び出し側でページ固有の文面を使いたい場合の上書き */
  description?: string;
};

export function buildRoomPath(roomId: RoomId): string {
  return `/chat/${roomId}`;
}

/**
 * なりきり UI (`/chanari/<id>`) のパス。
 *
 * ランタイム用は `@features/chanari-chat/routing` の `buildChanariRoomPath` だが、
 * あちらは import.meta.env.BASE_URL を読むため Node 直接実行のプリレンダから使えない。
 * このファイルの制約 (冒頭コメント参照) に合わせた固定形の実装を置く。
 */
export function buildChanariPath(roomId: RoomId): string {
  return `/chanari/${roomId}`;
}

/**
 * なりきり部屋ページ (`/chanari/<id>`) の SEO メタ。
 *
 * ChanariChatPage の useSEO 呼び出しと同値になるよう組む。ズレると hydrate 後に
 * head が書き換わり、プリレンダした値が一瞬だけ見える状態になる。
 * - title: 「{部屋名}（なりきり） | {サイト名}」
 * - canonical: `/chat/<id>`。内容が重複するため評価を通常チャット側に集約する
 *   (sitemap 除外と同じ canonical 化方針。.kiro/specs/seo-improvement design §3)
 * - jsonLd: 空。ChanariChatPage は useSEO に jsonLd を渡しておらず、hydrate 後に
 *   data-page-jsonld ノードが削除されるため、プリレンダで入れると
 *   「出してすぐ消す」ことになる
 */
export function buildChanariRoomSeo(roomId: RoomId): RoomSeo {
  const room = getRoomMeta(roomId);

  return {
    title: buildPageTitle(`${room.title}（なりきり）`),
    description: room.description,
    canonical: buildAbsoluteUrl(buildRoomPath(roomId)),
    ogImage: buildAbsoluteUrl('/ogp.png'),
    jsonLd: [],
  };
}

export function buildRoomSeo(roomId: RoomId, overrides: RoomSeoOverrides = {}): RoomSeo {
  const room = getRoomMeta(roomId);
  const canonical = buildAbsoluteUrl(buildRoomPath(roomId));
  const title = `${room.title} | ${SITE_NAME}`;
  const description = overrides.description ?? room.description;

  return {
    title,
    description,
    canonical,
    ogImage: buildAbsoluteUrl('/ogp.png'),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': canonical,
        url: canonical,
        name: title,
        description,
        inLanguage: 'ja-JP',
        // index.html のベース @graph で宣言している WebSite を参照する
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        // カテゴリ階層 (トップ → カテゴリ → 部屋) はカテゴリの実 URL が存在しないため
        // 2 階層にとどめる。Google は最終要素以外の item (URL) を必須とするので、
        // URL の無いカテゴリを中間に挟むとリッチリザルトテストでエラーになる (Req 5.3)。
        // カテゴリ名は最終要素の name に含めて文脈を補う。
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: `${SITE_ORIGIN}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: `${ROOM_CATEGORY_LABELS[room.category]} - ${room.title}`,
          },
        ],
      },
    ],
  };
}
