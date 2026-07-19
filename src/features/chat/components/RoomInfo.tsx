import { getRoomMeta, getRelatedRooms, ROOM_CATEGORY_LABELS, type RoomId } from '../rooms';
import { buildChatRoomPath } from '../routing';

/**
 * 入室前画面に表示する部屋の紹介セクション。
 *
 * SEO 上の一次コンテンツ (.kiro/specs/seo-improvement Req 7):
 * クローラが評価するのはレンダリング後のこの DOM なので、部屋紹介文・
 * カテゴリ・関連部屋への <a href> リンクをここで必ず描画する。
 * プリレンダの静的フォールバック (prerenderHtml.ts) も同じデータソース
 * (rooms.ts) から同構造を生成しており、両者の内容は一致する。
 * リンクは素の <a href> とする (pushState 化は service-improvement 側の管轄)。
 */
export default function RoomInfo({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);
  const related = getRelatedRooms(roomId);

  return (
    <section className="mx-auto max-w-[560px] px-4 pb-4 text-center text-[12px] leading-relaxed text-gray-700">
      <p>{room.description}</p>
      {related.length > 0 && (
        <p className="mt-2">
          <span className="font-bold">{ROOM_CATEGORY_LABELS[room.category]}</span>
          の他の部屋:{' '}
          {related.map((r, i) => (
            <span key={r.id}>
              {i > 0 && '／'}
              <a href={buildChatRoomPath(r.id)} className="text-blue-700 underline">
                {r.title}
              </a>
            </span>
          ))}
        </p>
      )}
      <p className="mt-2">
        <a href="/" className="text-blue-700 underline">
          部屋一覧（トップページ）へ
        </a>
      </p>
    </section>
  );
}
