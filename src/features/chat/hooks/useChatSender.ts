import { useTransition } from 'react';
import { saveChatLogOptimistic, createOptimisticChat } from '@features/chat/api/chatApi';
import { isFortuneCommand, generateFortune } from '@features/chat/utils/fortuneBot';
import type { Chat, ChatMetadata } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';

/**
 * 管理人（システム）発言の楽観的チャットを組み立てる純粋関数。
 * 入室 / 退室メッセージは部屋単位ビューと全部屋まとめビューで同じ体裁を使う。
 */
export function createAdminChat({
  roomId,
  message,
  userColor,
  extraMetadata,
}: {
  roomId: RoomId;
  message: string;
  userColor: string;
  extraMetadata?: Partial<ChatMetadata>;
}): Chat {
  return createOptimisticChat({
    room_id: roomId,
    name: '管理人',
    color: '#ffffff',
    message,
    client_time: Date.now(),
    system: true,
    ip_masked: '',
    ua: '',
    metadata: {
      version: 1,
      avatar: 'hoshi1',
      kind: 'admin',
      userColor,
      fontStyle: { bold: true },
      ...extraMetadata,
    },
  });
}

/**
 * 楽観的更新つき送信の共通部分。
 * useChatHandlers（部屋単位）と useAllRoomsChatHandlers（全部屋まとめ）で共有する。
 *
 * ip / ua は save-chat Edge Function がリクエストヘッダから確定するため、
 * クライアントからは送らない。
 */
export function useChatSender({
  addOptimistic,
  mergeChat,
}: {
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
}) {
  const [, startTransition] = useTransition();

  /** 楽観的チャットを即座に表示する */
  const showOptimistic = (chat: Chat) => {
    startTransition(() => addOptimistic(chat));
  };

  /** 保存し、サーバーが確定した内容でログをマージする */
  const saveAndMerge = async (roomId: RoomId, chat: Chat): Promise<Chat> => {
    const savedChat = await saveChatLogOptimistic(roomId, chat);
    startTransition(() => mergeChat(savedChat));
    return savedChat;
  };

  /** 表示 → 保存 → マージ をまとめて行う */
  const sendChat = async (roomId: RoomId, chat: Chat): Promise<Chat> => {
    showOptimistic(chat);
    return saveAndMerge(roomId, chat);
  };

  /**
   * おみくじコマンドだった場合に巫女メッセージを続けて投稿する。
   * 巫女メッセージの保存失敗はユーザー発言の成否に影響しないためサイレントに無視する。
   */
  const sendFortuneIfCommand = async (roomId: RoomId, message: string, senderName: string) => {
    if (!isFortuneCommand(message)) return;
    try {
      const fortune = generateFortune(senderName);
      await sendChat(
        roomId,
        createOptimisticChat({
          room_id: roomId,
          name: fortune.senderName,
          color: fortune.color,
          message: fortune.message,
          client_time: Date.now(),
          system: true,
          ip_masked: '',
          ua: '',
          metadata: { version: 1, kind: 'fortune', avatar: 'miko1', fontStyle: { bold: true } },
        })
      );
    } catch {
      // 巫女メッセージの保存失敗はサイレントに無視
    }
  };

  return { showOptimistic, saveAndMerge, sendChat, sendFortuneIfCommand };
}
