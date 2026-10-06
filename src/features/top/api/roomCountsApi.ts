import {
  getListableRoomIds,
  TWO_SHOT_CHAT_ENABLED,
  TWO_SHOT_ROOM_ID,
  type RoomId,
} from '@features/chat/rooms';

/** 直近の参加者カウントを返す辞書型 (未取得のルームはキーに存在しない) */
export type RoomCountMap = Partial<Record<RoomId, number>>;

/**
 * 公開ログ（`chats`）の発言者で数える部屋。ツーショットチャットの会話は `chats` に入らないので、
 * `2shot` は席に着いている人数（two_shot_lobby()）で数え、公開ログに残る過去の発言では数えない
 * （.kiro/specs/two-shot-chat Requirement 16.1）。ツーショットチャットを止めている間は `2shot` も通常の部屋なので、
 * ほかの部屋と同じく公開ログで数える
 */
function getPublicCountRoomIds(): RoomId[] {
  return TWO_SHOT_CHAT_ENABLED
    ? getListableRoomIds().filter((id) => id !== TWO_SHOT_ROOM_ID)
    : [...getListableRoomIds()];
}

/** Supabase 環境変数が不足している等で実行できない状況かを判定する */
function isSupabaseConfigured(): boolean {
  // 環境変数が未設定だと、shared/supabaseClient.ts は仮の URL でクライアントを組み立てる（通信は失敗する）。
  // ここでは url / anon_key が空なら接続せずに早期リターンする。
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

/**
 * PostgREST の RPC を素の fetch で呼ぶ。Supabase のクライアント（shared/supabaseClient.ts、vendor-supabase チャンク
 * 約 21 kB gz）を使わないのは、この問い合わせのためにトップページへライブラリを載せないため
 * (.kiro/specs/top-and-transition-performance Requirement 3)。
 */
/** 参加人数の RPC（supabase/migrations/20260923000000_room_participant_counts.sql） */
export function buildRoomCountsRpcUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/rest/v1/rpc/room_participant_counts`;
}

/** ツーショットチャットの空室状況（supabase/migrations/20260924000000_two_shot.sql の two_shot_lobby()） */
export function buildTwoShotLobbyUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/rest/v1/rpc/two_shot_lobby`;
}

type RoomCountRow = { room_id: string | null; participants: number | null };

/**
 * two_shot_lobby() の行から、席に着いている人数の合計を出す（待機中は 1 人、満室は 2 人）。
 * 形が違えば null（テスト用に export）。トップに two-shot の画面の部品を載せないため、ここで最小限だけ読む。
 */
export function countTwoShotSeats(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  let seated = 0;
  for (const row of rows as unknown[]) {
    const status =
      typeof row === 'object' && row !== null ? (row as { status?: unknown }).status : null;
    if (status === 'waiting') seated += 1;
    else if (status === 'full') seated += 2;
    else if (status !== 'empty') return null;
  }
  return seated;
}

/** RPC の結果を、一覧に出す部屋だけの RoomCountMap にする (テスト用に export) */
export function toRoomCountMap(rows: readonly RoomCountRow[]): RoomCountMap {
  const listable = new Set<string>(getPublicCountRoomIds());
  const result: RoomCountMap = {};
  for (const row of rows) {
    if (!row.room_id || !listable.has(row.room_id)) continue;
    if (typeof row.participants !== 'number' || row.participants <= 0) continue;
    result[row.room_id as RoomId] = row.participants;
  }
  return result;
}

/**
 * 直近 `windowMs` の部屋ごとの参加人数。サーバー側の RPC で集計し、部屋の数ぶんの行だけを受け取る
 * （.kiro/specs/react-2026-refactoring Requirement 14）。
 *
 * 失敗したら（404 を含む）空オブジェクトを返す（左カラムは「0人」で描画を続ける）。以前は 404（RPC の適用前）の
 * ときに発言の行を最大 5000 行取得してクライアントで数えていたが、RPC は本番に適用済みなので消した（Issue #187）。
 * RPC は負荷の上限として 24 時間より前を見ないので、`windowMs` は 24 時間以内で使う。
 *
 * ツーショットチャットだけは、今席に着いている人数を two_shot_lobby() から並行して取る。
 * 片方が失敗しても、もう片方の人数は残す（失敗した側の部屋は「0人」）。
 */
export async function fetchRoomParticipantCounts(
  windowMs: number = 6 * 60 * 60 * 1000
): Promise<RoomCountMap> {
  if (!isSupabaseConfigured()) {
    return {};
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const since = Date.now() - windowMs;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };

  const [publicCounts, twoShotSeated] = await Promise.all([
    fetchPublicCounts(baseUrl, since, headers),
    // 止めている間は席の人数を問い合わせない（`2shot` は公開ログで数える）
    TWO_SHOT_CHAT_ENABLED ? fetchTwoShotSeated(baseUrl, headers) : Promise.resolve(0),
  ]);
  return twoShotSeated > 0 ? { ...publicCounts, [TWO_SHOT_ROOM_ID]: twoShotSeated } : publicCounts;
}

/** 公開ログの部屋の人数。失敗したら空 */
async function fetchPublicCounts(
  baseUrl: string,
  since: number,
  headers: Record<string, string>
): Promise<RoomCountMap> {
  try {
    const response = await fetch(buildRoomCountsRpcUrl(baseUrl), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ since_ms: since }),
    });
    if (response.ok) {
      return toRoomCountMap((await response.json()) as RoomCountRow[]);
    }
    if (import.meta.env.DEV) {
      console.warn('[roomCountsApi] rpc failed:', response.status, response.statusText);
    }
    return {};
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[roomCountsApi] unexpected error:', err);
    }
    return {};
  }
}

/** ツーショットチャットで席に着いている人数。失敗（RPC の適用前の 404 を含む）や形の違う応答は 0 */
async function fetchTwoShotSeated(
  baseUrl: string,
  headers: Record<string, string>
): Promise<number> {
  try {
    const response = await fetch(buildTwoShotLobbyUrl(baseUrl), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      if (import.meta.env.DEV) {
        console.warn('[roomCountsApi] two_shot_lobby failed:', response.status);
      }
      return 0;
    }
    return countTwoShotSeats(await response.json()) ?? 0;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[roomCountsApi] two_shot_lobby error:', err);
    }
    return 0;
  }
}
