import { resolveRouteFollowingRedirects } from './resolveRoute';

/**
 * チャット系ルートの動的 import 群。
 *
 * `App.tsx` の `React.lazy` と `preloadRoute` が同じ関数を共有することで、
 * 先読みと描画で同一のモジュールキャッシュに当たるようにしている。
 *
 * トップ (`TopRoute`) は入口なので意図的に含めない。lazy にすると
 * 「チャンク到着まで何も出せない」時間が必ず入り、体感の初期描画が
 * 分割前より悪くなるため (.kiro/specs/top-and-transition-performance Requirement 2)。
 */
export const routeLoaders = {
  'chat-room': () => import('./ChatRoute'),
  'all-rooms': () => import('./AllRoomsRoute'),
  'chanari-room': () => import('./ChanariRoute'),
  'not-found': () => import('./NotFoundRoute'),
} as const;

/**
 * 指定 URL が使うルートチャンクを先に解決する。
 *
 * `React.lazy` は初回レンダー時に未解決だと Suspense の fallback を出すため、
 * エントリで先に解決しておくと分割前と同じく「いきなり本体が出る」挙動を保てる。
 * チャンク自体はプリレンダ HTML の modulePreload で並行取得済みなので待ちは増えない。
 * SSG (Requirement 8) で hydrate する際にも、未解決だと SSG 済みの内容が fallback に
 * 置き換わってしまうため、この事前解決が前提になる。
 *
 * 失敗しても解決済み扱いにして描画へ進む (RouteHost の ErrorBoundary が拾う)。
 */
export function preloadRoute(pathname: string): Promise<unknown> | null {
  const { route } = resolveRouteFollowingRedirects(pathname);
  const key = route.type === 'chat-room' && route.roomId === 'all' ? 'all-rooms' : route.type;
  const load = routeLoaders[key as keyof typeof routeLoaders];
  // トップは静的 import なのでローダを持たない。null を返して
  // 呼び出し側が「待たずに描画してよい」と判断できるようにする。
  return load ? load().catch(() => undefined) : null;
}
