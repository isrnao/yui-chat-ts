import { useTransition } from 'react';
import {
  saveChatLogOptimistic,
  createOptimisticChat,
  type SaveChatOptions,
} from '@features/chat/api/chatApi';
import { isFortuneCommand, generateFortune } from '@features/chat/utils/fortuneBot';
import { recordSendChat } from '@shared/observability/newRelic';
import { generateOperationId } from '@shared/utils/uuid';
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
  const saveAndMerge = async (
    roomId: RoomId,
    chat: Chat,
    options?: SaveChatOptions
  ): Promise<Chat> => {
    const savedChat = await saveChatLogOptimistic(roomId, chat, options);
    startTransition(() => mergeChat(savedChat));
    return savedChat;
  };

  /**
   * 利用者自身の発言を保存する。送信操作の ID をここで 1 つ発行し、Browser の send-chat
   * インタラクションと save-chat（x-chat-operation-id）で共有する（spec R5.5 / R5.8）。
   * 入退室の管理人メッセージや巫女メッセージは利用者の操作ではないので saveAndMerge を使い、
   * send-chat として記録しない。記録は同期的に行い、送信のイベントの中でインタラクションに結びつける。
   */
  const saveUserMessage = (roomId: RoomId, chat: Chat): Promise<Chat> => {
    const operationId = generateOperationId();
    recordSendChat(operationId);
    return saveAndMerge(roomId, chat, { operationId });
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

  return { showOptimistic, saveAndMerge, saveUserMessage, sendChat, sendFortuneIfCommand };
}
