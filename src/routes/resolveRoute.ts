import { matchRoute } from '@features/chat/routing';
import type { RouteMatch } from '@features/chat/routing';
import { matchChanariRoute } from '@features/chanari-chat/routing';
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
