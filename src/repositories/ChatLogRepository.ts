import type { Chat } from "../types";

export interface IChatLogRepository {
  load(): Chat[];
  save(log: Chat[]): void;
  clear(): void;
}

export class LocalStorageChatLogRepository implements IChatLogRepository {
  private static STORAGE_KEY = "yui_chat_dat";
  private static MAX_CHAT_LOG = 2000;

  load(): Chat[] {
    try {
      const raw = localStorage.getItem(LocalStorageChatLogRepository.STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, LocalStorageChatLogRepository.MAX_CHAT_LOG);
    } catch {
      return [];
    }
  }

  save(log: Chat[]): void {
    try {
      localStorage.setItem(
        LocalStorageChatLogRepository.STORAGE_KEY,
        JSON.stringify(log.slice(0, LocalStorageChatLogRepository.MAX_CHAT_LOG))
      );
    } catch {
      // ignore
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(LocalStorageChatLogRepository.STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
