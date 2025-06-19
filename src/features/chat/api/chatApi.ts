import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';

const TABLE = 'chats';
const MAX_CHAT_LOG = 100;
const CACHE_DURATION = 5 * 60 * 1000; // 5分

// 軽量パフォーマンス追跡
let perfStartTime = 0;
function startPerf() {
  perfStartTime = performance.now();
}

function endPerf(operation: string) {
  const duration = performance.now() - perfStartTime;
  // 本番環境でも重大なパフォーマンス問題は警告
  if (duration > 3000) {
    console.warn(`Performance issue in ${operation}: ${duration.toFixed(0)}ms`);
  }
}

// 簡易インメモリキャッシュ
interface CacheItem {
  data: Chat[];
  timestamp: number;
}

let chatLogsCache: CacheItem | null = null;

// パフォーマンス測定用のヘルパー関数（開発環境のみ）
async function measureApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  return await apiCall();
}

// リトライ機能付きのAPI呼び出し
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await measureApiCall(apiCall);
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error;
      }

      // 指数バックオフで待機
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function loadChatLogs(useCache = true): Promise<Chat[]> {
  startPerf();

  return retryApiCall(async () => {
    // オフライン時はモックデータを返す
    if (!isOnline()) {
      endPerf('loadChatLogs-offline');
      return mockChatData;
    }

    // キャッシュチェック
    if (useCache && chatLogsCache) {
      const now = Date.now();
      if (now - chatLogsCache.timestamp < CACHE_DURATION) {
        endPerf('loadChatLogs-cache');
        return chatLogsCache.data;
      }
    }

    // 必要な列のみ選択して、サーバー側でのデータ転送量を削減
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,name,color,message,time,system,email')
      .order('time', { ascending: false })
      .limit(MAX_CHAT_LOG);

    if (error) {
      // 401 Unauthorized の場合はモックデータで代替
      if (error.code === '401' || error.message.includes('JWT')) {
        return mockChatData;
      }

      throw new Error(`Supabase error: ${error.message} (${error.code})`);
    }

    if (!data) {
      return [];
    }

    const chatData = (data as Chat[]) || [];

    // キャッシュに保存
    chatLogsCache = {
      data: chatData,
      timestamp: Date.now(),
    };

    endPerf('loadChatLogs-network');

    return chatData;
  });
}

// 増分読み込み用関数を追加
export async function loadChatLogsWithPaging(
  limit = 50,
  offset = 0,
  useCache = true
): Promise<{ data: Chat[]; hasMore: boolean }> {
  return retryApiCall(async () => {
    // 初回読み込み時はキャッシュから返す
    if (offset === 0 && useCache && chatLogsCache) {
      const now = Date.now();
      if (now - chatLogsCache.timestamp < CACHE_DURATION) {
        return {
          data: chatLogsCache.data.slice(0, limit),
          hasMore: chatLogsCache.data.length > limit,
        };
      }
    }

    const { data, count, error } = await supabase
      .from(TABLE)
      .select('id,name,color,message,time,system,email', { count: 'exact' })
      .order('time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Supabase pagination error: ${error.message} (${error.code})`);
    }

    const chatData = (data as Chat[]) || [];

    // 初回読み込み時はキャッシュに保存
    if (offset === 0) {
      chatLogsCache = {
        data: chatData,
        timestamp: Date.now(),
      };
    }

    return {
      data: chatData,
      hasMore: (count || 0) > offset + limit,
    };
  });
}

// 初回読み込み時の最適化された関数
export async function loadInitialChatLogs(limit = 100): Promise<Chat[]> {
  const result = await loadChatLogsWithPaging(limit, 0, true);
  return result.data;
}

export async function saveChatLog(chat: Chat): Promise<Chat> {
  const sanitized = {
    id: chat.id,
    name: chat.name,
    color: chat.color,
    message: chat.message,
    // timeは除外 - Supabaseでサーバー側のタイムスタンプを使用
    system: chat.system,
    email: chat.email,
    ip: chat.ip,
    ua: chat.ua,
  };

  // insertして、サーバー側のタイムスタンプ付きでデータを取得
  const { data, error } = await supabase.from(TABLE).insert(sanitized).select('*').single();

  if (error) {
    throw new Error(`Failed to save chat: ${error.message}`);
  }

  // 新しいチャットが追加されたらキャッシュを無効化
  invalidateCache();

  // サーバー側のタイムスタンプを含むデータを返す
  return data as Chat;
}

export async function clearChatLogs(): Promise<void> {
  await supabase.from(TABLE).delete().neq('id', '');

  // チャットログがクリアされたらキャッシュを無効化
  invalidateCache();
}

// キャッシュ無効化関数
export function invalidateCache(): void {
  chatLogsCache = null;
}

// キャッシュ状態確認関数
export function getCacheInfo(): { cached: boolean; age?: number } {
  if (!chatLogsCache) {
    return { cached: false };
  }

  return {
    cached: true,
    age: Date.now() - chatLogsCache.timestamp,
  };
}

export function subscribeChatLogs(callback: (chat: Chat) => void) {
  return supabase
    .channel('chats')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) =>
      callback(payload.new as Chat)
    )
    .subscribe();
}
