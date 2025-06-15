import type { Chat } from '@features/chat/types';

const MAX_CHAT_LOG = 2000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE = 'chat_logs';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export async function loadChatLogs(): Promise<Chat[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=*` +
        `&order=time.desc&limit=${MAX_CHAT_LOG}`,
      { headers: HEADERS }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Chat[];
    return data;
  } catch {
    return [];
  }
}

export async function postChat(chat: Chat): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(chat),
    });
  } catch {
    // ignore
  }
}


export async function clearChatLogs(): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=gt.0`, {
      method: 'DELETE',
      headers: HEADERS,
    });
  } catch {
    // ignore
  }
}
