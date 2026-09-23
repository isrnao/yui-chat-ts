import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';
import { normalizeChat } from '../utils/normalizeMetadata';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';
import {
  aggregateChatRanking,
  compareRankingEntries,
  type RankingEntry,
} from '../utils/chatRanking';
import { retryWithBackoff, warnIfSlow } from './retry';

/**
 * chats テーブルへの問い合わせ（読み取りと論理削除）。
 *
 * 以前は chatLogResource が 5 分の TTL キャッシュ・進行中のリクエストの共有・paging を持っていたが、
 * 画面遷移はすべて全ページ読み込みなのでキャッシュが生きるのは 1 ページの表示中だけで、Realtime の
 * 発言も入らないため古くなるだけだった。同じ部屋の取得は Room_Log_Store が 1 つにまとめるので、
 * ここは素直に問い合わせるだけにする（.kiro/specs/react-2026-refactoring Requirement 6.8）。
 */

const TABLE = 'chats';
/** ip / ua の生値は転送しない（ip_masked はサーバーでマスク済みの表示用の値） */
const SELECT_COLUMNS = 'uuid,room_id,name,color,message,time,system,email,ip_masked,ua,metadata';
/** 全部屋まとめは論理削除した発言も出すので、個人情報の露出を防ぐため email / ua を除く */
const ALL_ROOMS_SELECT_COLUMNS = 'uuid,room_id,name,color,message,time,system,ip_masked,metadata';
/** 部屋ごとの発言ランキングを集計するビュー (supabase/migrations/20260921000000) */
const RANKING_VIEW = 'chat_ranking';

/** オフライン時・認証エラー時に出す既定のログ（意図した挙動。spec Q2） */
function getOfflineChatData(roomId: RoomId): Chat[] {
  return mockChatData.map((chat) => ({ ...chat, room_id: roomId }));
}

/**
 * 部屋の直近 `limit` 件を uuid の降順で取得する。
 * オフライン時と認証エラー（401 / JWT）のときは既定のログを返す。
 */
export async function loadRecentChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 10
): Promise<Chat[]> {
  const startTime = performance.now();
  return retryWithBackoff(async () => {
    if (!isOnline()) return getOfflineChatData(roomId).slice(0, limit);

    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq('room_id', roomId)
      .eq('deleted', false)
      .order('uuid', { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === '401' || error.message.includes('JWT')) {
        return getOfflineChatData(roomId).slice(0, limit);
      }
      throw new Error(`Supabase error: ${error.message} (${error.code})`);
    }

    warnIfSlow('loadRecentChatLogs', startTime);
    return (data ?? []).map(normalizeChat);
  });
}

/** 全部屋の直近 `limit` 件（room の条件なし・論理削除も含む・uuid の降順） */
export async function loadAllRoomsChatLogs(limit = 200): Promise<Chat[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(ALL_ROOMS_SELECT_COLUMNS)
    .order('uuid', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load all rooms chat logs: ${error.message}`);
  }

  return (data ?? []).map(normalizeChat);
}

// 指定したハンドルネームの発言に削除フラグを立てる（論理削除）
export async function clearChatLogsByName(
  roomId: RoomId = DEFAULT_ROOM_ID,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted: true })
    .eq('room_id', roomId)
    .eq('name', name);
  if (error) {
    throw new Error(`Failed to clear chat logs: ${error.message}`);
  }
}

type ChatRankingRow = {
  name: string;
  post_count: number;
  last_time: number;
  color: string;
  host: string | null;
};

/**
 * 部屋の発言ランキングを全期間で取得する。
 *
 * 集計は chat_ranking ビューがサーバー側で行う (system 発言は除外、deleted は問わない)。
 * 以前は表示用に読み込んだ直近最大 100 件を手元で数えていたため、それより前にしか
 * 発言していないユーザーが載らず、発言回数も直近分だけになっていた。
 *
 * 転送量は発言者数ぶんだけで、総発言数には比例しない。
 */
export async function loadChatRanking(roomId: RoomId = DEFAULT_ROOM_ID): Promise<RankingEntry[]> {
  return retryWithBackoff(async () => {
    // オフライン時は手元のモックデータで数える
    if (!isOnline()) {
      return aggregateChatRanking(getOfflineChatData(roomId));
    }

    const { data, error } = await supabase
      .from(RANKING_VIEW)
      .select('name,post_count,last_time,color,host')
      .eq('room_id', roomId)
      .order('post_count', { ascending: false })
      .order('last_time', { ascending: false });

    if (error) {
      throw new Error(`Supabase ranking query error: ${error.message} (${error.code})`);
    }

    // 並びはサーバーで付けているが、クライアント集計と同じ比較関数で揃え直しておく
    // (同数・同時刻の並びをテスト / オフライン時と一致させるため)
    return ((data ?? []) as ChatRankingRow[])
      .map(
        (row): RankingEntry => ({
          name: row.name,
          count: row.post_count,
          lastTime: row.last_time,
          color: row.color,
          host: row.host ?? '',
        })
      )
      .sort(compareRankingEntries);
  });
}
