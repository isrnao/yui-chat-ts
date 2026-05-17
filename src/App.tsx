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

function upsertMetaColor(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', content);
}

function resolveShellChrome(route: RouteMatch | ChanariRouteMatch): ShellChrome {
  switch (route.type) {
    case 'top':
    case 'not-found':
      return TOP_SHELL_CHROME;
    case 'chat-room':
      return CHAT_SHELL_CHROME;
    case 'chanari-room':
      return CHANARI_SHELL_CHROME;
    case 'redirect':
      return route.to.includes('/chanari/') ? CHANARI_SHELL_CHROME : CHAT_SHELL_CHROME;
  }
}

function resolveRoute(pathname: string): RouteMatch | ChanariRouteMatch {
  const chanari = matchChanariRoute(pathname);
  if (chanari !== null) return chanari;
  return matchRoute(pathname);
}

type ResolvedRoute = Exclude<RouteMatch | ChanariRouteMatch, { type: 'redirect' }>;

// 'redirect' route は再帰的に解決して history を書き換え、確定形のみを返す。
// redirect を React state に載せないことで「effect 内で setState して再 effect」というカスケードを避ける。
function resolveRouteFollowingRedirects(pathname: string): ResolvedRoute {
  let current = resolveRoute(pathname);
  while (current.type === 'redirect') {
    window.history.replaceState(null, '', current.to);
    current = resolveRoute(current.to);
  }
  return current;
}

export default function App() {
  const [route, setRoute] = useState<ResolvedRoute>(() =>
    resolveRouteFollowingRedirects(window.location.pathname)
  );

  useEffect(() => {
    const handlePopState = () => {
      setRoute(resolveRouteFollowingRedirects(window.location.pathname));
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
