import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { normalizeChat } from '../utils/normalizeMetadata';

const TABLE = 'chats';
// email / ua は全部屋ビューで deleted=true 行も表示するため、個人情報露出防止で除外する。
// ip_masked はサーバー側でマスク済みの表示用の値なので、発言末尾の時刻表示のために取得する。
const SELECT_COLUMNS = 'uuid,room_id,name,color,message,time,system,ip_masked,metadata';

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
 * onError は CHANNEL_ERROR / TIMED_OUT / CLOSED 時に呼ばれる。
 */
export function subscribeAllRoomsChatLogs(
  callback: (chat: Chat) => void,
  onError?: () => void
): {
  unsubscribe: () => void;
} {
  const channel = supabase
    .channel('chats-postgres-all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => {
      // 初期ロードの SELECT_COLUMNS は email / ua を含まない。realtime payload には
      // 含まれるため、ここで落として形を揃える。揃えないと同じ発言が「到着直後は
      // UA / メールリンクあり、再読み込み後はなし」という不整合を起こす。
      callback({ ...normalizeChat(payload.new), email: undefined, ua: '' });
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onError?.();
      }
    });

  return {
    unsubscribe() {
      supabase.removeChannel(channel);
    },
  };
}
