import { supabase } from '@shared/supabaseClient';
import type { Chat } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Supabase 上のテーブル名
const TABLE_NAME = 'chats';
const MAX_CHAT_LOG = 2000;

// 最新のチャットログを取得
export async function loadChatLogs(): Promise<Chat[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('time', { ascending: false })
    .limit(MAX_CHAT_LOG);
  if (error) {
    console.error(error);
    return [];
  }
  return (data as Chat[]) ?? [];
}

// チャットを1件保存
export async function saveChatLogs(chat: Chat): Promise<void> {
  const { error } = await supabase.from(TABLE_NAME).insert(chat);
  if (error) throw error;
}

// チャットログを全削除
export async function clearChatLogs(): Promise<void> {
  const { error } = await supabase.from(TABLE_NAME).delete().neq('id', '');
  if (error) throw error;
}

// 新規チャット追加を購読
export function subscribeChatLogs(
  onInsert: (chat: Chat) => void
): RealtimeChannel {
  return supabase
    .channel(`public:${TABLE_NAME}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE_NAME },
      (payload) => onInsert(payload.new as Chat)
    )
    .subscribe();
}
