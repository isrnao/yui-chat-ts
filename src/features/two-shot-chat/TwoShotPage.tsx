import { useSyncExternalStore } from 'react';
import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { sessionStore } from './api/sessionStore';
import LobbyScreen from './screens/LobbyScreen';
import RoomRestoreBoundary from './screens/RoomScreen';
import { buildTwoShotSeo } from './seo';

/**
 * ツーショットチャットのページ（/chat/2shot/）。spec: .kiro/specs/two-shot-chat/design.md §8
 *
 * このタブの Session がなければ（または入室の保留中なら）入口、active なら入室後の画面を出す。
 * SSG と hydration の間は Session を読まないので、常に入口を描く（sessionStore.getServerSnapshot は null）。
 * タイトルはここ 1 か所で決める（seo.ts）。名前などの私的な値は head にも計測にも入れない。
 */
export default function TwoShotPage() {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot
  );
  // プリレンダ（renderTwoShotHtml）も同じ buildTwoShotSeo で head を作る。SSG は常に入口なので hydrate 時は一致する
  const seo = buildTwoShotSeo(session?.status === 'active' ? session.roomId : null);
  useSEO(seo);
  usePageView(seo.title);

  if (session?.status === 'active') {
    return <RoomRestoreBoundary key={session.token} session={session} />;
  }
  return <LobbyScreen pending={session?.status === 'pending' ? session : null} />;
}
