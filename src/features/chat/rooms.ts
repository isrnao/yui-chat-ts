export const CHAT_ROOM_IDS = ['superbeginner', 'hajime', 'ofall'] as const;

export type RoomId = (typeof CHAT_ROOM_IDS)[number];

export type RoomMeta = {
  id: RoomId;
  title: string;
  description: string;
  enabled: boolean;
};

export const DEFAULT_ROOM_ID: RoomId = 'superbeginner';

export const CHAT_ROOMS: Record<RoomId, RoomMeta> = {
  superbeginner: {
    id: 'superbeginner',
    title: '超初心者チャット',
    description: '超初心者向けのお気楽チャット',
    enabled: true,
  },
  hajime: {
    id: 'hajime',
    title: '初めましてチャット',
    description: '準備中のチャットルーム',
    enabled: false,
  },
  ofall: {
    id: 'ofall',
    title: 'みんなのチャット',
    description: '準備中のチャットルーム',
    enabled: false,
  },
};

export function isRoomId(value: string): value is RoomId {
  return Object.prototype.hasOwnProperty.call(CHAT_ROOMS, value);
}

export function isEnabledRoomId(value: string): value is RoomId {
  return isRoomId(value) && CHAT_ROOMS[value].enabled;
}

export function getRoomMeta(roomId: RoomId): RoomMeta {
  return CHAT_ROOMS[roomId];
}
