import { useCallback } from 'react';
import type { Chat } from '../types';
import type { ChatApi } from '../../api/chat';
import type { UseChatSessionResult } from './useChatSession';

export type FetchClientInfo = () => Promise<{ ip: string; ua: string }>;

export type UseChatActionsOptions = {
  chatApi: ChatApi;
  session: UseChatSessionResult;
  fetchClientInfo: FetchClientInfo;
  validateName?: (name: string) => string | null;
  systemAuthor?: { name: string; color: string };
  defaultEmail?: string;
  systemMessages?: {
    onEnter?: (name: string) => string;
    onExit?: (name: string) => string;
  };
  commandHandlers?: Record<string, () => Promise<void> | void>;
  onCommand?: (command: string) => void;
};

export type ChatActions = {
  enter(payload: { name: string; color: string; email?: string }): Promise<void>;
  exit(payload: { name: string; color: string; email?: string }): Promise<void>;
  sendMessage(payload: { message: string; name: string; color: string; email?: string }): Promise<void>;
  reload(): Promise<void>;
  clearHistory(): Promise<void>;
};

const DEFAULT_SYSTEM_AUTHOR = { name: '管理人', color: '#0000ff' };

export function useChatActions(options: UseChatActionsOptions): ChatActions {
  const {
    chatApi,
    session,
    fetchClientInfo,
    validateName,
    systemAuthor = DEFAULT_SYSTEM_AUTHOR,
    defaultEmail = '',
    systemMessages = {
      onEnter: (name: string) => `${name}さん、おいでやすぅ。`,
      onExit: (name: string) => `${name}さん、またきておくれやすぅ。`,
    },
    commandHandlers = {},
    onCommand,
  } = options;

  const mergedCommandHandlers: Record<string, () => Promise<void> | void> = {
    clear: async () => {
      await session.clear();
    },
    cut: () => undefined,
    ...commandHandlers,
  };

  const handleCommand = useCallback(
    async (command: string) => {
      onCommand?.(command);
      const handler = mergedCommandHandlers[command];
      if (handler) {
        await handler();
      }
    },
    [mergedCommandHandlers, onCommand],
  );

  const buildMetadata = useCallback(
    async () => {
      const { ip, ua } = await fetchClientInfo();
      return { ip, ua };
    },
    [fetchClientInfo],
  );

  const dispatchOptimistic = useCallback(
    async (chat: Chat) => {
      session.addOptimistic(chat);
      await chatApi.addOptimisticChatToCache(chat);
      return chat;
    },
    [chatApi, session],
  );

  const finalizeOptimistic = useCallback(
    async (optimisticUuid: string, serverChat: Chat) => {
      session.resolveOptimistic(optimisticUuid, serverChat);
      await chatApi.replaceOptimisticChatInCache(optimisticUuid, serverChat);
    },
    [chatApi, session],
  );

  const enter = useCallback<ChatActions['enter']>(
    async ({ name, color, email }) => {
      const trimmed = name.trim();
      const validationError = validateName?.(trimmed) ?? null;
      if (validationError) {
        throw new Error(validationError);
      }

      const optimistic = chatApi.createOptimisticChat({
        name: systemAuthor.name,
        color: systemAuthor.color,
        message: systemMessages.onEnter?.(trimmed) ?? `${trimmed}さんが入室しました。`,
        system: true,
        email: email ?? defaultEmail,
        ip: '',
        ua: '',
      });

      await dispatchOptimistic(optimistic);

      const metadata = await buildMetadata();
      const serverChat = await chatApi.saveChatLogOptimistic({
        ...optimistic,
        ...metadata,
      });

      await finalizeOptimistic(optimistic.uuid, serverChat);
    },
    [
      buildMetadata,
      chatApi,
      defaultEmail,
      dispatchOptimistic,
      finalizeOptimistic,
      systemAuthor.color,
      systemAuthor.name,
      systemMessages,
      validateName,
    ],
  );

  const exit = useCallback<ChatActions['exit']>(
    async ({ name, color, email }) => {
      const baseName = name.trim();
      if (!baseName) {
        return;
      }

      const optimistic = chatApi.createOptimisticChat({
        name: systemAuthor.name,
        color: systemAuthor.color,
        message: systemMessages.onExit?.(baseName) ?? `${baseName}さんが退室しました。`,
        system: true,
        email: email ?? defaultEmail,
        ip: '',
        ua: '',
      });

      await dispatchOptimistic(optimistic);

      const metadata = await buildMetadata();
      const serverChat = await chatApi.saveChatLogOptimistic({
        ...optimistic,
        ...metadata,
      });

      await finalizeOptimistic(optimistic.uuid, serverChat);
    },
    [
      buildMetadata,
      chatApi,
      defaultEmail,
      dispatchOptimistic,
      finalizeOptimistic,
      systemAuthor.color,
      systemAuthor.name,
      systemMessages,
    ],
  );

  const sendMessage = useCallback<ChatActions['sendMessage']>(
    async ({ message, name, color, email }) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return;
      }

      const command = recogniseCommand(trimmed);
      if (command) {
        await handleCommand(command);
        return;
      }

      const optimistic = chatApi.createOptimisticChat({
        name,
        color,
        message: trimmed,
        system: false,
        email: email ?? defaultEmail,
        ip: '',
        ua: '',
      });

      await dispatchOptimistic(optimistic);

      try {
        const metadata = await buildMetadata();
        const serverChat = await chatApi.saveChatLogOptimistic({
          ...optimistic,
          ...metadata,
        });
        await finalizeOptimistic(optimistic.uuid, serverChat);
      } catch (error) {
        session.mergeChat({ ...optimistic, optimistic: false });
        throw error;
      }
    },
    [
      buildMetadata,
      chatApi,
      defaultEmail,
      dispatchOptimistic,
      finalizeOptimistic,
      handleCommand,
      session,
    ],
  );

  const reload = useCallback<ChatActions['reload']>(() => session.refresh(), [session]);

  const clearHistory = useCallback<ChatActions['clearHistory']>(async () => {
    await session.clear();
  }, [session]);

  return {
    enter,
    exit,
    sendMessage,
    reload,
    clearHistory,
  };
}

function recogniseCommand(message: string): string | null {
  const normalized = message.toLowerCase();
  if (normalized === 'cut' || normalized === '/cut') {
    return 'cut';
  }
  if (normalized === 'clear' || normalized === '/clear') {
    return 'clear';
  }
  return null;
}
