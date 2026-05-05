import { supabase } from '@shared/supabaseClient';
import { CHAT_ROOM_IDS, type RoomId } from '@features/chat/rooms';
import type { ChatMetadata } from '@features/chat/types';

/** 直近の参加者カウントを返す辞書型 (未取得のルームはキーに存在しない) */
export type RoomCountMap = Partial<Record<RoomId, number>>;

/** 取得に使う最小限のカラム */
type ChatRow = {
  room_id: string | null;
  name: string | null;
  message: string | null;
  system: boolean | null;
  metadata: ChatMetadata | null;
  time: number | null;
};

/** Supabase 環境変数が不足している等で実行できない状況かを判定する */
function isSupabaseConfigured(): boolean {
  // 環境変数未設定時は createClient 側が落ちないように空文字で初期化される。
  // url / anon_key が空なら接続しない方針で早期リターンする。
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

/**
 * `chats` テーブルから `time >= (now - windowMs)` のレコードを取得し、
 * ルームごとのユニーク参加者数 (= ユニーク発言者数) を集計する。
 *
 * 集計は累積方式: 直近 `windowMs` 内に 1 回でも発言した通常ユーザーを
 * その部屋の参加者として 1 カウントする。退室メッセージによる減算は行わない
 * (6 時間ウィンドウの「活動ユーザー数」として扱うため)。
 *
 * Supabase に到達できない / 設定がない場合は空オブジェクトを返す。
 * 呼び出し側でフォールバックを用意すること。
 */
export async function fetchRoomParticipantCounts(
  windowMs: number = 6 * 60 * 60 * 1000
): Promise<RoomCountMap> {
  if (!isSupabaseConfigured()) {
    return {};
  }

  const since = Date.now() - windowMs;

  try {
    const { data, error } = await supabase
      .from('chats')
      .select('room_id, name, message, system, metadata, time')
      .gte('time', since)
      .in('room_id', CHAT_ROOM_IDS as unknown as string[])
      .eq('deleted', false)
      .order('time', { ascending: true })
      .limit(5000);

    if (error || !data) {
      if (import.meta.env.DEV) {
        console.warn('[roomCountsApi] fetch failed:', error?.message);
      }
      return {};
    }

    return aggregateCountsFromRows(data as ChatRow[]);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[roomCountsApi] unexpected error:', err);
    }
    return {};
  }
}

/**
 * ルームごとのユニーク発言者数を算出する純関数 (テスト用に export)。
 *
 * 対象: `system = false` かつ `name` が非空の行 (= 通常ユーザーの発言)。
 * 管理人メッセージ (metadata.kind === 'admin') および system フラグ付き行はスキップする。
 */
export function aggregateCountsFromRows(rows: readonly ChatRow[]): RoomCountMap {
  const participantsByRoom = new Map<RoomId, Set<string>>();

  for (const row of rows) {
    const roomId = row.room_id as RoomId | null;
    if (!roomId) continue;
    if (!CHAT_ROOM_IDS.includes(roomId)) continue;
    if (row.system) continue;
    if (row.metadata?.kind === 'admin') continue;
    if (!row.name) continue;

    const set = participantsByRoom.get(roomId) ?? new Set<string>();
    set.add(row.name);
    participantsByRoom.set(roomId, set);
  }

  const result: RoomCountMap = {};
  for (const [roomId, set] of participantsByRoom) {
    result[roomId] = set.size;
  }
  return result;
}
