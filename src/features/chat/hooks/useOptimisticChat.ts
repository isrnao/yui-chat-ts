import { useState, useCallback } from 'react';
import { generateChatId } from '@shared/utils/uuid';
import type { Chat } from '@features/chat/types';
import {
  saveChatLogOptimistic,
  saveChatLogFireAndForget,
  createOptimisticChat,
  addOptimisticChatToCache,
  replaceOptimisticChatInCache,
} from '@features/chat/api/chatApi';

interface UseOptimisticChatOptions {
  onSuccess?: (chat: Chat) => void;
  onError?: (error: Error, optimisticChat: Chat) => void;
  strategy?: 'optimistic' | 'fire-and-forget';
}

export function useOptimisticChat({
  onSuccess,
  onError,
  strategy = 'optimistic',
}: UseOptimisticChatOptions = {}) {
  const [pendingChats, setPendingChats] = useState<Set<string>>(new Set());

  const sendChatOptimistic = useCallback(
    async (chatData: Omit<Chat, 'uuid' | 'time' | 'optimistic'>) => {
      const optimisticUuid = generateChatId();
      const optimisticChat = createOptimisticChat({
        ...chatData,
        uuid: optimisticUuid,
      });

      try {
        // UIを即座に更新
        addOptimisticChatToCache(optimisticChat);
        onSuccess?.(optimisticChat);

        // ペンディング状態を追加
        setPendingChats((prev) => new Set(prev).add(optimisticUuid));

        if (strategy === 'fire-and-forget') {
          // Fire-and-forget: レスポンスを待たない
          await saveChatLogFireAndForget(optimisticChat);

          // 楽観的に成功したものとして扱う
          const serverChat: Chat = {
            ...optimisticChat,
            time: Date.now(), // 概算のサーバータイムスタンプ
            optimistic: false,
          };

          replaceOptimisticChatInCache(optimisticUuid, serverChat);
        } else {
          // Optimistic: 最小限のサーバーレスポンスを待つ
          const serverChat = await saveChatLogOptimistic(optimisticChat);

          // キャッシュ内の楽観的チャットをサーバーの結果で置換
          replaceOptimisticChatInCache(optimisticUuid, serverChat);
        }

        // ペンディング状態を削除
        setPendingChats((prev) => {
          const newSet = new Set(prev);
          newSet.delete(optimisticUuid);
          return newSet;
        });
      } catch (error) {
        // エラー時は楽観的チャットを削除
        setPendingChats((prev) => {
          const newSet = new Set(prev);
          newSet.delete(optimisticUuid);
          return newSet;
        });

        onError?.(error as Error, optimisticChat);

        // エラー時はキャッシュから楽観的チャットを削除する必要があるかもしれません
        // この部分は具体的な要件に応じて実装してください
      }
    },
    [onSuccess, onError, strategy]
  );

  return {
    sendChatOptimistic,
    pendingChats,
    isPending: pendingChats.size > 0,
  };
}
