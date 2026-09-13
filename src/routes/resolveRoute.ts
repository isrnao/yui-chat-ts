import { matchRoute } from '@features/chat/routing';
import type { RouteMatch } from '@features/chat/routing';
import { matchChanariRoute } from '@features/chanari-chat/routing';
import type { ChanariRouteMatch } from '@features/chanari-chat/routing';

export type ResolvedRoute = Exclude<RouteMatch | ChanariRouteMatch, { type: 'redirect' }>;

export type RouteResolution = {
  route: ResolvedRoute;
  /**
   * 入力 pathname から redirect chain を辿った後の最終 pathname。
   * 元の pathname と異なる場合のみ history.replaceState を commit 後 effect で実行する。
   */
  finalPathname: string;
};

function resolveRoute(pathname: string): RouteMatch | ChanariRouteMatch {
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
