import { useCallback, useEffect, useRef, useState, useOptimistic, startTransition } from 'react';
import { loadAllRoomsChatLogs, subscribeAllRoomsChatLogs } from '@features/chat/api/chatAllApi';
import { mergeAggregatedLog } from '@features/chat/utils/aggregatedLog';
import { reduceOptimisticChat } from './useChatLog';
import type { Chat } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';

export function useAllRoomsChatLog(onRealtimeChat?: (chat: Chat) => void): {
  chatLog: Chat[];
  isLoading: boolean;
  loadError: boolean;
  subscribeError: boolean;
  isEmpty: boolean;
  setChatLog: Dispatch<SetStateAction<Chat[]>>;
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
  reload: () => void;
} {
  const [baseLog, setBaseLog] = useState<Chat[]>([]);
  // 初期値 true: マウント直後は読み込み中
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [subscribeError, setSubscribeError] = useState(false);
  // reload ごとにインクリメントして effect を再実行させる
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  // effect が再実行されたとき同期 setState を避けるため ref で管理する
  const effectRunRef = useRef(0);

  const mergeChat = useCallback((chat: Chat) => {
    setBaseLog((prev) => mergeAggregatedLog(prev, chat));
  }, []);

  const [chatLog, addOptimisticInternal] = useOptimistic(baseLog, reduceOptimisticChat);

  const addOptimistic = useCallback(
    (chat: Chat) => {
      startTransition(() => {
        addOptimisticInternal(chat);
      });
    },
    [addOptimisticInternal]
  );

  useEffect(() => {
    let ignore = false;
    const run = ++effectRunRef.current;

    // 再実行時のみリセット（初回は useState の初期値のまま）
    if (run > 1) {
      setIsLoading(true);
      setLoadError(false);
    }

    loadAllRoomsChatLogs(200)
      .then((logs) => {
        // realtime で先着した新着を丸ごと上書きしないよう merge する
        if (!ignore) setBaseLog((prev) => mergeAggregatedLog(logs, prev));
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    let sub: ReturnType<typeof subscribeAllRoomsChatLogs> | null = null;
    try {
      sub = subscribeAllRoomsChatLogs(
        (chat) => {
          if (!ignore) {
            onRealtimeChat?.(chat);
            mergeChat(chat);
          }
        },
        () => {
          // CHANNEL_ERROR / TIMED_OUT / CLOSED: 同期 setState を避けるため非同期で更新
          void Promise.resolve().then(() => {
            if (!ignore) setSubscribeError(true);
          });
        }
      );
    } catch {
      void Promise.resolve().then(() => {
        if (!ignore) setSubscribeError(true);
      });
    }

    return () => {
      ignore = true;
      sub?.unsubscribe();
    };
  }, [mergeChat, onRealtimeChat, reloadKey]);

  return {
    chatLog,
    isLoading,
    loadError,
    subscribeError,
    isEmpty: !isLoading && !loadError && baseLog.length === 0,
    setChatLog: setBaseLog,
    addOptimistic,
    mergeChat,
    reload,
  };
}
