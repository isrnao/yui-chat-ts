/**
 * ツーショットチャットのページの SEO メタ。TwoShotPage の useSEO と、プリレンダ（prerenderHtml.ts の
 * renderTwoShotHtml）の両方がこれを使い、SSG した head と hydrate 後の head を一致させる。
 *
 * canonical・og:url・説明文・構造化データは部屋（/chat/2shot/）のもの（buildRoomSeo）。タイトルだけ原作の画面名にし、
 * 入室中は部屋名を足す。名前などの私的な値は入れない。
 *
 * scripts/prerender-rooms.ts から Node で直接読むので、import は相対パスと .ts 拡張子にし、
 * import.meta.env を読むモジュール（routing.ts など）を import しない（roomSeo.ts と同じ制約）。
 */
import { TWO_SHOT_ROOM_ID } from '../chat/rooms.ts';
import { buildRoomSeo, type RoomSeo } from '../../shared/utils/roomSeo.ts';
import { buildPageTitle } from '../../shared/utils/seo.ts';
import { getTwoShotRoomName, TWO_SHOT_CONFIG } from './config.ts';

/** @param roomId 入室中の部屋。入口（一覧）では null */
export function buildTwoShotSeo(roomId: string | null): RoomSeo {
  const pageName =
    roomId === null
      ? TWO_SHOT_CONFIG.title
      : `${TWO_SHOT_CONFIG.title} - ${getTwoShotRoomName(roomId)}`;
  return { ...buildRoomSeo(TWO_SHOT_ROOM_ID), title: buildPageTitle(pageName) };
}
