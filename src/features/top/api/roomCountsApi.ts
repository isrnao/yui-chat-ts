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

export type RoomCountResult = {
  kind: 'ready' | 'partial' | 'failed' | 'unavailable';
  counts: RoomCountMap;
  failedRooms: RoomId[];
  asOf?: number;
};
type Read<T> = { ok: true; value: T } | { ok: false };
async function read<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  parse: (value: unknown) => T | null,
  signal?: AbortSignal
): Promise<Read<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return { ok: false };
    const value = parse(await response.json());
    return value === null ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}
function parseCounts(value: unknown): RoomCountMap | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        (row.room_id === null || typeof row.room_id === 'string') &&
        (row.participants === null ||
          (Number.isSafeInteger(row.participants) && row.participants >= 0))
    )
  )
    return null;
  return toRoomCountMap(value as RoomCountRow[]);
}
/** 状態を保持する公開UI用。失敗したsourceを0人へ変換しない。 */
export async function fetchRoomCountsResult(
  windowMs = 6 * 60 * 60 * 1000,
  signal?: AbortSignal
): Promise<RoomCountResult> {
  if (!isSupabaseConfigured())
    return { kind: 'unavailable', counts: {}, failedRooms: [...getListableRoomIds()] };
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
  const [publicRead, seats] = await Promise.all([
    read(
      buildRoomCountsRpcUrl(baseUrl),
      headers,
      { since_ms: Date.now() - windowMs },
      parseCounts,
      signal
    ),
    TWO_SHOT_CHAT_ENABLED
      ? read(buildTwoShotLobbyUrl(baseUrl), headers, {}, countTwoShotSeats, signal)
      : Promise.resolve({ ok: true, value: 0 } as const),
  ]);
  const failedRooms: RoomId[] = publicRead.ok ? [] : getPublicCountRoomIds();
  if (!seats.ok && TWO_SHOT_CHAT_ENABLED) failedRooms.push(TWO_SHOT_ROOM_ID);
  const counts = publicRead.ok ? publicRead.value : {};
  if (seats.ok && TWO_SHOT_CHAT_ENABLED && seats.value > 0) counts[TWO_SHOT_ROOM_ID] = seats.value;
  const anySuccess = publicRead.ok || (TWO_SHOT_CHAT_ENABLED && seats.ok);
  return {
    kind: failedRooms.length === 0 ? 'ready' : anySuccess ? 'partial' : 'failed',
    counts,
    failedRooms,
    ...(anySuccess ? { asOf: Date.now() } : {}),
  };
}
