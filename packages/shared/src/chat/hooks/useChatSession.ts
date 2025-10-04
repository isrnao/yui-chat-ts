import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chat } from '../types';
import type { ChatApi } from '../../api/chat';
import type { ConnectivityListener } from '../../utils/fallback';

export type UseChatSessionOptions = {
  chatApi: ChatApi;
  maxItems?: number;
  realtime?: boolean;
  onError?: (error: Error) => void;
};

export type UseChatSessionResult = {
  chatLog: Chat[];
  isLoading: boolean;
  isOffline: boolean;
  pendingIds: Set<string>;
  error: Error | null;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
  resolveOptimistic: (optimisticUuid: string, serverChat: Chat) => void;
};

const DEFAULT_MAX_ITEMS = 2_000;

export function useChatSession(options: UseChatSessionOptions): UseChatSessionResult {
  const { chatApi, maxItems = DEFAULT_MAX_ITEMS, realtime = true, onError } = options;

  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!chatApi.isOnline());
  const [error, setError] = useState<Error | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const upsert = useCallback(
    (next: Chat) => {
      setChatLog((prev) => {
        const index = prev.findIndex((chat) => chat.uuid === next.uuid);
        if (index !== -1) {
          const copy = [...prev];
          copy[index] = next;
          return limitChats(copy, maxItems);
        }
        return limitChats([next, ...prev], maxItems);
      });
    },
    [maxItems],
  );

  const addOptimistic = useCallback(
    (chat: Chat) => {
      upsert(chat);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(chat.uuid);
        return next;
      });
    },
    [upsert],
  );

  const mergeChat = useCallback(
    (chat: Chat) => {
      upsert(chat);
      setPendingIds((prev) => {
        if (!prev.has(chat.uuid)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(chat.uuid);
        return next;
      });
    },
    [upsert],
  );

  const resolveOptimistic = useCallback(
    (optimisticUuid: string, serverChat: Chat) => {
      setChatLog((prev) => {
        const index = prev.findIndex((chat) => chat.uuid === optimisticUuid);
        if (index === -1) {
          return prev;
        }
        const copy = [...prev];
        copy[index] = serverChat;
        return limitChats(copy, maxItems);
      });
      setPendingIds((prev) => {
        if (!prev.has(optimisticUuid)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(optimisticUuid);
        next.add(serverChat.uuid);
        return next;
      });
    },
    [maxItems],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const logs = await chatApi.loadChatLogs(true);
      if (!isMounted.current) return;
      setChatLog(limitChats(logs, maxItems));
      setError(null);
    } catch (err) {
      const errorObject = err instanceof Error ? err : new Error('Failed to load chat logs');
      if (!isMounted.current) return;
      setError(errorObject);
      onError?.(errorObject);
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [chatApi, maxItems, onError]);

  const clear = useCallback(async () => {
    await chatApi.clearChatLogs();
    if (!isMounted.current) return;
    setChatLog([]);
    setPendingIds(new Set());
  }, [chatApi]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!realtime) {
      return;
    }

    const channel = chatApi.subscribeChatLogs((chat) => {
      mergeChat(chat);
    });

    return () => {
      channel.unsubscribe();
    };
  }, [chatApi, mergeChat, realtime]);

  useEffect(() => {
    const listener: ConnectivityListener = (online) => {
      setIsOffline(!online);
    };

    setIsOffline(!chatApi.isOnline());

    const unsubscribe = chatApi.onConnectivityChange?.(listener);
    return () => {
      unsubscribe?.();
    };
  }, [chatApi]);

  return useMemo(
    () => ({
      chatLog,
      isLoading,
      isOffline,
      pendingIds,
      error,
      refresh,
      clear,
      addOptimistic,
      mergeChat,
      resolveOptimistic,
    }),
    [
      chatLog,
      isLoading,
      isOffline,
      pendingIds,
      error,
      refresh,
      clear,
      addOptimistic,
      mergeChat,
      resolveOptimistic,
    ],
  );
}

function limitChats(chats: Chat[], maxItems: number): Chat[] {
  if (chats.length <= maxItems) {
    return chats;
  }
  return chats.slice(0, maxItems);
}
