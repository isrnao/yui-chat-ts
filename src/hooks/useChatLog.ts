import { useState, useEffect, useCallback, useTransition } from "react";
import { loadChatLog, saveChatLog, clearChatLog } from "../utils/storage";
import type { Chat } from "../types";

export function useChatLog() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [, startTransition] = useTransition();

  // 初期ロード
  useEffect(() => {
    setChatLog(loadChatLog());
  }, []);

  const addChat = useCallback((chat: Chat) => {
    startTransition(() => {
      setChatLog(prev => {
        const newLog = [chat, ...prev];
        saveChatLog(newLog);
        return newLog;
      });
    });
  }, []);

  const clear = useCallback(() => {
    setChatLog([]);
    clearChatLog();
  }, []);

  const reload = useCallback(() => {
    setChatLog(loadChatLog());
  }, []);

  return { chatLog, addChat, clear, reload, setChatLog };
}
