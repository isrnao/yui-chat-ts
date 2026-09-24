import { lazy, useEffect, useState } from 'react';
import { RouteHost } from './routes/RouteHost';
import { routeLoaders } from './routes/routeLoaders';
// トップは入口であり、ここだけは lazy にしない。
// lazy にすると「チャンク到着まで何も出せない」時間が必ず入り、
// 体感の初期描画が分割前より悪くなる (サイズは 30KB 程度で分割の旨味が薄い)。
// 重い依存 (supabase / チャット一式) はチャット系ルートの側に残っている。
import TopRoute from './routes/TopRoute';
import {
  resolveRouteFollowingRedirects,
  type ResolvedRoute,
  type RouteResolution,
} from './routes/resolveRoute';

// チャット系ルートの code splitting。トップページ訪問者にチャット一式と
// supabase-js を配らないための分割
// (.kiro/specs/top-and-transition-performance Requirement 2)。
const ChatRoute = lazy(routeLoaders['chat-room']);
const AllRoomsRoute = lazy(routeLoaders['all-rooms']);
const ChanariRoute = lazy(routeLoaders['chanari-room']);
const TwoShotRoute = lazy(routeLoaders['two-shot']);
const NotFoundRoute = lazy(routeLoaders['not-found']);

type ShellChrome = {
  backgroundColor: string;
  themeColor: string;
};

const TOP_SHELL_CHROME: ShellChrome = {
  backgroundColor: '#ffffff',
  themeColor: '#ffffff',
};

const CHAT_SHELL_CHROME: ShellChrome = {
  backgroundColor: '#c1fc92',
  themeColor: '#c1fc92',
};

const CHANARI_SHELL_CHROME: ShellChrome = {
  backgroundColor: '#ffffdd',
  themeColor: '#ffffdd',
};

// 原作のツーショットチャットは白地（.kiro/specs/two-shot-chat Requirement 1.7）
const TWO_SHOT_SHELL_CHROME: ShellChrome = {
  backgroundColor: '#ffffff',
  themeColor: '#ffffff',
};

function upsertMetaColor(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', content);
}

function resolveShellChrome(route: ResolvedRoute): ShellChrome {
  switch (route.type) {
    case 'top':
    case 'not-found':
      return TOP_SHELL_CHROME;
    case 'chat-room':
      return CHAT_SHELL_CHROME;
    case 'chanari-room':
      return CHANARI_SHELL_CHROME;
    case 'two-shot':
      return TWO_SHOT_SHELL_CHROME;
  }
}

/**
 * @param initialPathname SSG 時に描画対象の URL を渡す。クライアントでは未指定にして
 *   `window.location.pathname` を使う。SSG した URL でそのまま読み込まれる限り
 *   両者は一致するので hydration mismatch は起きない。
 */
export default function App({ initialPathname }: { initialPathname?: string } = {}) {
  const [resolution, setResolution] = useState<RouteResolution>(() =>
    resolveRouteFollowingRedirects(initialPathname ?? window.location.pathname)
  );
  const { route, finalPathname } = resolution;

  // commit 後に URL を redirect 後の最終形に合わせる (resolveRouteFollowingRedirects は pure)。
  // 初回 mount 時に URL が /chat や /chanari (= redirect 元) のままなら、ここで replaceState する。
  useEffect(() => {
    if (window.location.pathname !== finalPathname) {
      window.history.replaceState(null, '', finalPathname);
    }
  }, [finalPathname]);

  useEffect(() => {
    const handlePopState = () => {
      setResolution(resolveRouteFollowingRedirects(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const shellChrome = resolveShellChrome(route);

    document.documentElement.style.backgroundColor = shellChrome.backgroundColor;
    document.body.style.backgroundColor = shellChrome.backgroundColor;
    upsertMetaColor('theme-color', shellChrome.themeColor);
    upsertMetaColor('msapplication-TileColor', shellChrome.themeColor);
  }, [route]);

  return (
    <RouteHost>
      {route.type === 'top' && <TopRoute />}
      {route.type === 'chat-room' &&
        (route.roomId === 'all' ? <AllRoomsRoute /> : <ChatRoute roomId={route.roomId} />)}
      {/*
        key={roomId}: ChanariChatPage の入力 state（名前・色・入力中の発言）は部屋ごとの下書きを
        既定値にしているので、roomId が変わったら remount して別 room の入力を持ち越さない。
        下書き自体は useChanariSettings が roomId ごとにストアから読む。
      */}
      {route.type === 'chanari-room' && <ChanariRoute key={route.roomId} roomId={route.roomId} />}
      {route.type === 'two-shot' && <TwoShotRoute />}
      {route.type === 'not-found' && <NotFoundRoute />}
    </RouteHost>
  );
}
