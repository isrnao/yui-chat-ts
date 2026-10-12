import { matchRoute, buildChatRoomPath } from '@features/chat/routing';
import type { RouteMatch } from '@features/chat/routing';
import { matchChanariRoute, buildChanariRoomPath } from '@features/chanari-chat/routing';
import { TWO_SHOT_ROOM_ID } from '@features/chat/rooms';
import type { ChanariRouteMatch } from '@features/chanari-chat/routing';
import { matchTwoShotRoute } from '@features/two-shot-chat/routing';
import type { TwoShotRouteMatch } from '@features/two-shot-chat/routing';

type AnyRouteMatch = RouteMatch | ChanariRouteMatch | TwoShotRouteMatch;

export type ResolvedRoute = Exclude<AnyRouteMatch, { type: 'redirect' }>;

export type RouteResolution = {
  route: ResolvedRoute;
  /**
   * 入力 pathname から redirect chain を辿った後の最終 pathname。
   * 元の pathname と異なる場合のみ history.replaceState を commit 後 effect で実行する。
   */
  finalPathname: string;
};

function resolveRoute(pathname: string): AnyRouteMatch {
  // ツーショットチャットは /chat/2shot/ と /chanari/2shot/ を通常の部屋より先に受ける
  const twoShot = matchTwoShotRoute(pathname);
  if (twoShot !== null) return twoShot;
  const chanari = matchChanariRoute(pathname);
  if (chanari !== null) return chanari;
  return matchRoute(pathname);
}

/**
 * PURE: redirect chain を解決して確定 route と最終 pathname を返す。
 * 副作用 (history.replaceState) は呼ばず、呼び出し側で commit 後 effect で実行する。
 */
export function resolveRouteFollowingRedirects(pathname: string): RouteResolution {
  let current = resolveRoute(pathname);
  let finalPathname = pathname;
  while (current.type === 'redirect') {
    finalPathname = current.to;
    current = resolveRoute(current.to);
  }
  return { route: current, finalPathname };
}

/** SSGとクライアントが共有する画面識別子。未知URLは既知ページと照合しない。 */
export function getSsgPathname(pathname: string): string | null {
  const { route } = resolveRouteFollowingRedirects(pathname);
  switch (route.type) {
    case 'top':
      return import.meta.env.BASE_URL;
    case 'chat-room':
      return buildChatRoomPath(route.roomId);
    case 'chanari-room':
      return buildChanariRoomPath(route.roomId);
    case 'two-shot':
      return buildChatRoomPath(TWO_SHOT_ROOM_ID);
    case 'not-found':
      return null;
  }
}

/** 静的入口が必要な既知のredirectだけを列挙。専用2shotの停止中は別名にしない。 */
export function getStaticAliases(): { pathname: string; target: string }[] {
  const base = import.meta.env.BASE_URL;
  return ['chat/', 'chanari/', 'chanari/all/', 'chanari/2shot/'].flatMap((suffix) => {
    const pathname = `${base}${suffix}`;
    const { finalPathname } = resolveRouteFollowingRedirects(pathname);
    return pathname !== finalPathname ? [{ pathname, target: finalPathname }] : [];
  });
}
