import { getListableRoomIds, TWO_SHOT_ROOM_ID, type RoomId } from '@features/chat/rooms';
import type { ChatMetadata } from '@features/chat/types';

/** 直近の参加者カウントを返す辞書型 (未取得のルームはキーに存在しない) */
export type RoomCountMap = Partial<Record<RoomId, number>>;

/** 取得に使う最小限のカラム */
type ChatRow = {
  room_id: string | null;
  name: string | null;
  message?: string | null;
  system: boolean | null;
  metadata: ChatMetadata | null;
  time: number | null;
};

/**
 * 公開ログ（`chats`）の発言者で数える部屋。ツーショットチャットの会話は `chats` に入らないので、
 * `2shot` は席に着いている人数（two_shot_lobby()）で数え、公開ログに残る過去の発言では数えない
 * （.kiro/specs/two-shot-chat Requirement 16.1）。
 */
function getPublicCountRoomIds(): RoomId[] {
  return getListableRoomIds().filter((id) => id !== TWO_SHOT_ROOM_ID);
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
/**
 * PostgREST へ直接投げるクエリ URL を組み立てる (テスト用に export)。
 *
 * Supabase のクライアント（shared/supabaseClient.ts、vendor-supabase チャンク 約 21 kB gz）を使わないのは、
 * この 1 クエリのためにトップページへライブラリを載せないため
 * (.kiro/specs/top-and-transition-performance Requirement 3)。
 * Supabase の REST は PostgREST そのものなので、素の fetch で等価に表現できる。
 */
export function buildRoomCountsUrl(baseUrl: string, since: number): string {
  const roomList = getPublicCountRoomIds().join(',');
  const params = new URLSearchParams({
    // 本文（message）は集計に使わないので取得しない。行数ぶん転送量が効く
    select: 'room_id,name,system,metadata,time',
    time: `gte.${since}`,
    room_id: `in.(${roomList})`,
    deleted: 'eq.false',
    order: 'time.asc',
    limit: '5000',
  });
  return `${baseUrl.replace(/\/$/, '')}/rest/v1/chats?${params.toString()}`;
}

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
 * RPC がまだ DB に無い（マイグレーションの適用前: 404）ときは、従来どおり発言の行を取得して
 * クライアントで数える。どちらも失敗したら空オブジェクトを返す（左カラムは「0人」で描画を続ける）。
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
    fetchTwoShotSeated(baseUrl, headers),
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
    if (response.status !== 404) {
      if (import.meta.env.DEV) {
        console.warn('[roomCountsApi] rpc failed:', response.status, response.statusText);
      }
      return {};
    }
    // RPC が未適用 → 従来の行取得へ
    return await fetchCountsFromRows(baseUrl, since, headers);
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

/** 従来の集計: 発言の行（最大 5000 行）を取得してクライアントで数える。RPC が無いときだけ使う */
async function fetchCountsFromRows(
  baseUrl: string,
  since: number,
  headers: Record<string, string>
): Promise<RoomCountMap> {
  const response = await fetch(buildRoomCountsUrl(baseUrl, since), { headers });
  if (!response.ok) {
    if (import.meta.env.DEV) {
      console.warn('[roomCountsApi] fetch failed:', response.status, response.statusText);
    }
    return {};
  }
  const rows = (await response.json()) as ChatRow[];
  return aggregateCountsFromRows(rows);
}

/**
 * ルームごとのユニーク発言者数を算出する純関数 (テスト用に export)。
 *
 * 対象: `system = false` かつ `name` が非空の行 (= 通常ユーザーの発言)。
 * 管理人メッセージ (metadata.kind === 'admin') および system フラグ付き行はスキップする。
 */
export function aggregateCountsFromRows(rows: readonly ChatRow[]): RoomCountMap {
  const listableRoomIdSet = new Set<string>(getPublicCountRoomIds());
  const participantsByRoom = new Map<RoomId, Set<string>>();

  for (const row of rows) {
    const roomId = row.room_id as RoomId | null;
    if (!roomId) continue;
    if (!listableRoomIdSet.has(roomId)) continue;
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
