import { DEFAULT_ROOM_ID, isEnabledRoomId, type RoomId } from './rooms';

export type RouteMatch =
  | { type: 'top' }
  | { type: 'chat-room'; roomId: RoomId }
  | { type: 'redirect'; to: string }
  | { type: 'not-found' };

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

export function buildChatRoomPath(roomId: RoomId): string {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL;

  return `${baseUrl}/chat/${roomId}`;
}

export function matchRoute(pathname: string): RouteMatch {
  const normalizedPath = stripBasePath(pathname);
  const segments = normalizedPath === '' ? [] : normalizedPath.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { type: 'top' };
  }

  if (segments.length === 1 && segments[0] === 'chat') {
    return { type: 'redirect', to: buildChatRoomPath(DEFAULT_ROOM_ID) };
  }

  if (segments.length === 2 && segments[0] === 'chat' && isEnabledRoomId(segments[1])) {
    return { type: 'chat-room', roomId: segments[1] };
  }

  return { type: 'not-found' };
}
