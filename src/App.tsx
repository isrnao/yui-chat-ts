import { useEffect, useState } from 'react';
import { matchRoute } from '@features/chat/routing';
import type { RouteMatch } from '@features/chat/routing';
import { matchChanariRoute } from '@features/chanari-chat/routing';
import type { ChanariRouteMatch } from '@features/chanari-chat/routing';
import ChatRoute from './routes/ChatRoute';
import TopRoute from './routes/TopRoute';
import ChanariRoute from './routes/ChanariRoute';
import NotFoundRoute from './routes/NotFoundRoute';

function resolveRoute(pathname: string): RouteMatch | ChanariRouteMatch {
  const chanari = matchChanariRoute(pathname);
  if (chanari !== null) return chanari;
  return matchRoute(pathname);
}

export default function App() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      setRoute(resolveRoute(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (route.type !== 'redirect') return;

    window.history.replaceState(null, '', route.to);
    setRoute(resolveRoute(window.location.pathname));
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
