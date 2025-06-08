import type { Chat } from "@/types";
const STORAGE_KEY = "yui_chat_dat";
const MAX_CHAT_LOG = 2000;

export function loadChatLog(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, MAX_CHAT_LOG);
  } catch {
    return [];
  }
}

export function saveChatLog(log: Chat[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(0, MAX_CHAT_LOG)));
  } catch {
    // ignore
  }
}

export function clearChatLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
