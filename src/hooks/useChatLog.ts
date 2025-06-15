import { useState, useEffect, useCallback, useTransition } from "react";
import { LocalStorageChatLogRepository } from "../repositories/ChatLogRepository";
import type { Chat } from "../types";

const repository = new LocalStorageChatLogRepository();

export function useChatLog() {
  const [chatLog, _setChatLog] = useState<Chat[]>([]);
  const [, startTransition] = useTransition();

  // setChatLogをラップし、どんな更新でもストレージ保存を保証
  const setChatLog = useCallback((updater: (prev: Chat[]) => Chat[]) => {
    _setChatLog(prev => {
      const next = updater(prev);
      repository.save(next);
      return next;
    });
  }, []);

  // 初期ロード
  useEffect(() => {
    _setChatLog(repository.load());
  }, []);

  const addChat = useCallback((chat: Chat) => {
    startTransition(() => {
      setChatLog(prev => [chat, ...prev]);
    });
  }, [setChatLog]);

  const clear = useCallback(() => {
    setChatLog(() => []);
    repository.clear();
  }, [setChatLog]);

  const reload = useCallback(() => {
    setChatLog(() => repository.load());
  }, [setChatLog]);

  return { chatLog, addChat, clear, reload, setChatLog };
}
