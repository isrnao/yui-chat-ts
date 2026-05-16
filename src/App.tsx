import { useEffect, useState } from 'react';
import { matchRoute } from '@features/chat/routing';
import type { RouteMatch } from '@features/chat/routing';
import { matchChanariRoute } from '@features/chanari-chat/routing';
import type { ChanariRouteMatch } from '@features/chanari-chat/routing';
import LazyRouteHost from '@shared/components/LazyRouteHost';
import type { RoomId } from '@features/chat/rooms';

const topFactory = () => import('./routes/TopRoute');
const chatFactory = () => import('./routes/ChatRoute');
const chanariFactory = () => import('./routes/ChanariRoute');
const notFoundFactory = () => import('./routes/NotFoundRoute');

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
      {route.type === 'top' && <LazyRouteHost factory={topFactory} />}
      {route.type === 'chat-room' && (
        <LazyRouteHost<{ roomId: RoomId }>
          factory={chatFactory}
          componentProps={{ roomId: route.roomId }}
        />
      )}
      {route.type === 'chanari-room' && (
        <LazyRouteHost<{ roomId: RoomId }>
          factory={chanariFactory}
          componentProps={{ roomId: route.roomId }}
        />
      )}
      {route.type === 'not-found' && <LazyRouteHost factory={notFoundFactory} />}
    </>
  );
}
