import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';

const TABLE = 'chats';
const MAX_CHAT_LOG = 2000;

export async function loadChatLogs(): Promise<Chat[]> {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .order('time', { ascending: false })
    .limit(MAX_CHAT_LOG);
  return (data as Chat[]) || [];
}

export async function saveChatLog(chat: Chat): Promise<void> {
  await supabase.from(TABLE).insert(chat);
}

export async function clearChatLogs(): Promise<void> {
  await supabase.from(TABLE).delete().neq('id', '');
}

export function subscribeChatLogs(callback: (chat: Chat) => void) {
  return supabase
    .channel('chats')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) =>
      callback(payload.new as Chat)
    )
    .subscribe();
}
