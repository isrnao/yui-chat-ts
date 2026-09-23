import { startTransition } from 'react';
import {
  saveChatLogOptimistic,
  createOptimisticChat,
  type SaveChatOptions,
} from '@features/chat/api/saveChat';
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
 * Chat_Session（useChatSession）が使う。
 *
 * 楽観的な表示から保存の完了までを 1 つの async Transition（Action）の中で行う。
 * useOptimistic の値は、それを包む Action が pending の間だけ残るため、同期の
 * startTransition で addOptimistic だけを呼ぶと、保存の完了を待たずに表示が消える。
 * 以前は呼び出し元が useActionState の中にいる経路（通常チャットの発言）でしか
 * 楽観的な表示が保たれず、入室・退室・ちゃなりの発言では保存が終わるまで出なかった。
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
  /**
   * 楽観的に表示し、保存し、サーバーが確定した内容でログをマージする。
   * 表示は同期で反映されるので、呼び出し元は返り値を await する前に入力欄のクリアなどを行える。
   * 保存に失敗すると楽観的な表示は消え、返り値の Promise が reject する。
   */
  const send = (roomId: RoomId, chat: Chat, options?: SaveChatOptions): Promise<Chat> =>
    new Promise<Chat>((resolve, reject) => {
      startTransition(async () => {
        addOptimistic(chat);
        try {
          const savedChat = await saveChatLogOptimistic(roomId, chat, options);
          // await の後は Transition の文脈が切れるので、もう一度包む
          startTransition(() => mergeChat(savedChat));
          resolve(savedChat);
        } catch (error) {
          // Action の中で投げると最寄りの Error Boundary に届くため、ここで捕まえて返す
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

  /**
   * 利用者自身の発言を送る。送信操作の ID をここで 1 つ発行し、Browser の send-chat
   * インタラクションと save-chat（x-chat-operation-id）で共有する（spec R5.5 / R5.8）。
   * 入退室の管理人メッセージや巫女メッセージは利用者の操作ではないので send を使い、
   * send-chat として記録しない。記録は同期的に行い、送信のイベントの中でインタラクションに結びつける。
   */
  const sendUserMessage = (roomId: RoomId, chat: Chat): Promise<Chat> => {
    const operationId = generateOperationId();
    recordSendChat(operationId);
    return send(roomId, chat, { operationId });
  };

  /**
   * おみくじコマンドだった場合に巫女メッセージを続けて投稿する。
   * 巫女メッセージの保存失敗はユーザー発言の成否に影響しないためサイレントに無視する。
   */
  const sendFortuneIfCommand = async (roomId: RoomId, message: string, senderName: string) => {
    if (!isFortuneCommand(message)) return;
    try {
      const fortune = generateFortune(senderName);
      await send(
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

  return { send, sendUserMessage, sendFortuneIfCommand };
}
