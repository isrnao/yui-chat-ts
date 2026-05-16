import { DEFAULT_ROOM_ID, isEnabledRoomId, type RoomId } from '@features/chat/rooms';

export type ChanariRouteMatch =
  | { type: 'chanari-room'; roomId: RoomId }
  | { type: 'redirect'; to: string };

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function getBasePath(baseUrl = import.meta.env.BASE_URL): string {
  return trimSlashes(baseUrl);
}

function stripBasePath(pathname: string): string {
  const trimmedPath = trimSlashes(pathname);
  const basePath = getBasePath();

  if (basePath && trimmedPath.startsWith(basePath)) {
    return trimSlashes(trimmedPath.slice(basePath.length));
  }

  return trimmedPath;
}

export function buildChanariRoomPath(roomId: RoomId): string {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL;

  return `${baseUrl}/chanari/${roomId}`;
}

export function matchChanariRoute(pathname: string): ChanariRouteMatch | null {
  const normalizedPath = stripBasePath(pathname);
  const segments = normalizedPath === '' ? [] : normalizedPath.split('/').filter(Boolean);

  if (segments.length === 0 || segments[0] !== 'chanari') {
    return null;
  }

  if (segments.length === 1 && segments[0] === 'chanari') {
    return { type: 'redirect', to: buildChanariRoomPath(DEFAULT_ROOM_ID) };
  }

  if (segments.length === 2 && segments[0] === 'chanari' && isEnabledRoomId(segments[1])) {
    return { type: 'chanari-room', roomId: segments[1] };
  }

  return null;
}
