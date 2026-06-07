import type { Chat, ChatMetadata, AvatarId } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';

export type AllRoomsIdentity = {
  name: string;
  color: string;
  email?: string;
  avatar?: AvatarId;
  fontStyle?: ChatMetadata['fontStyle'];
};

/** 空・空白文字のみの発言を判定する */
export function isBlankMessage(msg: string): boolean {
  return msg.trim().length === 0;
}

/**
 * Chat-All 送信ペイロードを構築する純粋関数。
 * 保存先 room_id を replyTarget に、kind を通常発言に設定する。
 */
export function buildAllRoomsSendPayload({
  replyTarget,
  identity,
  message,
  metadata,
}: {
  replyTarget: RoomId;
  identity: AllRoomsIdentity;
  message: string;
  metadata?: ChatMetadata;
}): { roomId: RoomId; chatData: Omit<Chat, 'uuid' | 'time' | 'optimistic'> } {
  const base: ChatMetadata = { version: 1 };
  if (identity.fontStyle) base.fontStyle = identity.fontStyle;
  if (identity.avatar && identity.avatar !== 'none') {
    base.avatar = identity.avatar as Exclude<AvatarId, 'none'>;
  }

  let resolvedMetadata: ChatMetadata;
  if (metadata) {
    const rest: Omit<ChatMetadata, 'kind'> = Object.fromEntries(
      Object.entries(metadata).filter(([k]) => k !== 'kind')
    ) as Omit<ChatMetadata, 'kind'>;
    resolvedMetadata = { ...base, ...rest };
  } else {
    resolvedMetadata = base;
  }

  return {
    roomId: replyTarget,
    chatData: {
      room_id: replyTarget,
      name: identity.name,
      color: identity.color,
      message,
      client_time: Date.now(),
      email: identity.email,
      ip: '',
      ua: '',
      metadata: resolvedMetadata,
    },
  };
}

/** clear コマンドの対象判定: 現在の返信先部屋かつ自分の発言のみ */
export function isClearTarget(chat: Chat, replyTarget: RoomId, myName: string): boolean {
  return chat.room_id === replyTarget && chat.name === myName;
}
