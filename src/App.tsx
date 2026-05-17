import { useEffect, useState } from 'react';
import { matchRoute } from '@features/chat/routing';
import type { RouteMatch } from '@features/chat/routing';
import { matchChanariRoute } from '@features/chanari-chat/routing';
import type { ChanariRouteMatch } from '@features/chanari-chat/routing';
import ChatRoute from './routes/ChatRoute';
import TopRoute from './routes/TopRoute';
import ChanariRoute from './routes/ChanariRoute';
import NotFoundRoute from './routes/NotFoundRoute';

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

type ResolvedRoute = Exclude<RouteMatch | ChanariRouteMatch, { type: 'redirect' }>;

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

function resolveRoute(pathname: string): RouteMatch | ChanariRouteMatch {
  const chanari = matchChanariRoute(pathname);
  if (chanari !== null) return chanari;
  return matchRoute(pathname);
}

type RouteResolution = {
  route: ResolvedRoute;
  // 入力 pathname から redirect chain を辿った後の最終 pathname。
  // 元の pathname と異なる場合のみ history.replaceState を commit 後 effect で実行する。
  finalPathname: string;
};

// PURE: redirect chain を解決して確定 route と最終 pathname を返す。
// 副作用 (history.replaceState) は呼ばず、呼び出し側で commit 後 effect で実行する。
function resolveRouteFollowingRedirects(pathname: string): RouteResolution {
  let current = resolveRoute(pathname);
  let finalPathname = pathname;
  while (current.type === 'redirect') {
    finalPathname = current.to;
    current = resolveRoute(current.to);
  }
  return { route: current, finalPathname };
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
    <>
      {route.type === 'top' && <TopRoute />}
      {route.type === 'chat-room' && <ChatRoute roomId={route.roomId} />}
      {/*
        key={roomId}: ChanariChatPage は useState(settings.X) で入力 state を初期化するため
        roomId 変化時に remount しないと別 room の入力 / 下書きが残ってしまう。
        useChanariSettings 側にも useEffect の再 hydrate を入れているが、ここで remount を強制することが根本対策。
      */}
      {route.type === 'chanari-room' && <ChanariRoute key={route.roomId} roomId={route.roomId} />}
      {route.type === 'not-found' && <NotFoundRoute />}
    </>
  );
}
