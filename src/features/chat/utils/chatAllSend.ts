import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';

/** 空・空白文字のみの発言を判定する */
export function isBlankMessage(msg: string): boolean {
  return msg.trim().length === 0;
}

/** clear コマンドの対象判定: 現在の返信先部屋かつ自分の発言のみ */
export function isClearTarget(chat: Chat, replyTarget: RoomId, myName: string): boolean {
  return chat.room_id === replyTarget && chat.name === myName;
}
