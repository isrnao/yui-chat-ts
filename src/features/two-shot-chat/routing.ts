import { TWO_SHOT_ROOM_ID } from '@features/chat/rooms';
import { buildChatRoomPath } from '@features/chat/routing';

export type TwoShotRouteMatch = { type: 'two-shot' } | { type: 'redirect'; to: string };

/**
 * ツーショットチャットのルート（.kiro/specs/two-shot-chat design.md §1）。
 *
 * - `/chat/2shot/`（末尾の / がなくても）→ two-shot
 * - `/chanari/2shot/`（同）→ `/chat/2shot/` へリダイレクト（ちゃなりの見た目で開かないようにする）
 * - それ以外 → null（既存の matchChanariRoute / matchRoute に任せる）
 *
 * BASE_URL はパスの区切りごとに比べて取り除く（`/app` の base で `/application/...` を誤って削らない）。
 */
export function matchTwoShotRoute(pathname: string): TwoShotRouteMatch | null {
  const base = import.meta.env.BASE_URL.split('/').filter(Boolean);
  const segments = pathname.split('/').filter(Boolean);
  if (base.some((part, index) => segments[index] !== part)) return null;

  const [section, roomId, ...rest] = segments.slice(base.length);
  if (roomId !== TWO_SHOT_ROOM_ID || rest.length > 0) return null;
  if (section === 'chat') return { type: 'two-shot' };
  if (section === 'chanari') return { type: 'redirect', to: buildChatRoomPath(TWO_SHOT_ROOM_ID) };
  return null;
}
