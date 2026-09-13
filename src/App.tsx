import { lazy, useEffect, useState } from 'react';
import { RouteHost } from './routes/RouteHost';
import { routeLoaders } from './routes/routeLoaders';
import {
  resolveRouteFollowingRedirects,
  type ResolvedRoute,
  type RouteResolution,
} from './routes/resolveRoute';

// ルート単位の code splitting。トップページ訪問者にチャット一式を配らないための分割。
// 静的 import に戻すと index チャンクへ再び同居するので注意
// (.kiro/specs/top-and-transition-performance Requirement 2)。
const ChatRoute = lazy(routeLoaders['chat-room']);
const AllRoomsRoute = lazy(routeLoaders['all-rooms']);
const TopRoute = lazy(routeLoaders.top);
const ChanariRoute = lazy(routeLoaders['chanari-room']);
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
  }
}

export default function App() {
  const [resolution, setResolution] = useState<RouteResolution>(() =>
    resolveRouteFollowingRedirects(window.location.pathname)
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
        key={roomId}: ChanariChatPage は useState(settings.X) で入力 state を初期化するため
        roomId 変化時に remount しないと別 room の入力 / 下書きが残ってしまう。
        useChanariSettings 側にも useEffect の再 hydrate を入れているが、ここで remount を強制することが根本対策。
      */}
      {route.type === 'chanari-room' && <ChanariRoute key={route.roomId} roomId={route.roomId} />}
      {route.type === 'not-found' && <NotFoundRoute />}
    </RouteHost>
  );
}
