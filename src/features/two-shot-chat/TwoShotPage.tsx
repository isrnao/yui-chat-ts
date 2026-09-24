import { useSyncExternalStore } from 'react';
import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { buildPageTitle } from '@shared/utils/seo';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { sessionStore } from './api/sessionStore';
import { getTwoShotRoomName, TWO_SHOT_CONFIG } from './config';
import LobbyScreen from './screens/LobbyScreen';
import RoomRestoreBoundary from './screens/RoomScreen';

/** rooms.ts の部屋 ID（トップのリンク・サイトマップ・canonical はこの部屋のもの） */
export const TWO_SHOT_ROOM_ID = '2shot';

/**
 * ツーショットチャットのページ（/chat/2shot/）。spec: .kiro/specs/two-shot-chat/design.md §8
 *
 * このタブの Session がなければ（または入室の保留中なら）入口、active なら入室後の画面を出す。
 * SSG と hydration の間は Session を読まないので、常に入口を描く（sessionStore.getServerSnapshot は null）。
 * タイトルはここ 1 か所で決める。名前などの私的な値は head にも計測にも入れない。
 */
export default function TwoShotPage() {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot
  );
  const seo = buildRoomSeo(TWO_SHOT_ROOM_ID);
  const title =
    session?.status === 'active'
      ? buildPageTitle(`${TWO_SHOT_CONFIG.title} - ${getTwoShotRoomName(session.roomId)}`)
      : buildPageTitle(TWO_SHOT_CONFIG.title);
  useSEO({ ...seo, title });
  usePageView(title);

  if (session?.status === 'active') {
    return <RoomRestoreBoundary key={session.token} session={session} />;
  }
  return <LobbyScreen pending={session?.status === 'pending' ? session : null} />;
}
