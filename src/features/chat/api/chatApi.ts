import type { Chat } from '@features/chat/types';

// チャットAPIラッパー

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE_NAME = 'chats';
const MAX_CHAT_LOG = 2000;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export async function loadChatLogs(): Promise<Chat[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*&order=time.desc&limit=${MAX_CHAT_LOG}`,
      { headers }
    );
    if (!res.ok) return [];
    return (await res.json()) as Chat[];
  } catch {
    return [];
  }
}

export async function saveChatLogs(log: Chat[]): Promise<void> {
  try {
    const chat = log[0];
    if (!chat) return;
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify([chat]),
    });
  } catch {
    // ignore
  }
}

export async function clearChatLogs(): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=gt.0`, {
      method: 'DELETE',
      headers,
    });
  } catch {
    // ignore
  }
}
