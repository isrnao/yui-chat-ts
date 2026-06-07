import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { normalizeChat } from '../utils/normalizeMetadata';

const TABLE = 'chats';
const SELECT_COLUMNS = 'uuid,room_id,name,color,message,time,system,email,metadata';

/**
 * 横断読み込み: room_id フィルタなし・deleted 無視・uuid 降順・limit 件。
 * 既存の chatLogResource キャッシュを一切経由しない別経路。
 */
export async function loadAllRoomsChatLogs(limit = 200): Promise<Chat[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .order('uuid', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load all rooms chat logs: ${error.message}`);
  }

  return (data ?? []).map(normalizeChat);
}

/**
 * 横断購読: room_id フィルタなしの単一 channel で全 INSERT を受ける。
 * 既存の subscribeChatLogs は一切変更しない。
 */
export function subscribeAllRoomsChatLogs(callback: (chat: Chat) => void): {
  unsubscribe: () => void;
} {
  const channel = supabase
    .channel('chats-postgres-all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => {
      callback(normalizeChat(payload.new));
    })
    .subscribe();

  return {
    unsubscribe() {
      supabase.removeChannel(channel);
    },
  };
}
