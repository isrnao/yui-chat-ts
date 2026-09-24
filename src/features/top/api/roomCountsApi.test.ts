import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateCountsFromRows,
  buildRoomCountsUrl,
  countTwoShotSeats,
  fetchRoomParticipantCounts,
  toRoomCountMap,
} from './roomCountsApi';
import type { ChatMetadata } from '@features/chat/types';

type Row = {
  room_id: string | null;
  name: string | null;
  message: string | null;
  system: boolean | null;
  metadata: ChatMetadata | null;
  time: number | null;
};

const speak = (roomId: string, name: string, time: number): Row => ({
  room_id: roomId,
  name,
  message: 'hello',
  system: false,
  metadata: null,
  time,
});

const systemRow = (roomId: string, name: string, time: number): Row => ({
  room_id: roomId,
  name,
  message: 'system',
  system: true,
  metadata: null,
  time,
});

const adminRow = (roomId: string, time: number): Row => ({
  room_id: roomId,
  name: null,
  message: 'alice さん、Welcome to お気楽チャット',
  system: true,
  metadata: { version: 1, kind: 'admin' },
  time,
});

describe('aggregateCountsFromRows', () => {
  it('counts unique speakers per room', () => {
    const rows: Row[] = [
      speak('superbeginner', 'alice', 1),
      speak('superbeginner', 'bob', 2),
      speak('superbeginner', 'alice', 3), // 重複
      speak('ofall', 'carol', 4),
    ];

    expect(aggregateCountsFromRows(rows)).toEqual({
      superbeginner: 2, // alice, bob
      ofall: 1,
    });
  });

  it('ignores system messages and admin announcements', () => {
    const rows: Row[] = [
      adminRow('superbeginner', 1),
      systemRow('superbeginner', 'alice', 2),
      speak('superbeginner', 'bob', 3),
    ];

    // 通常発言者 bob のみカウント
    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });

  it('drops rows with unknown room_id', () => {
    const rows: Row[] = [speak('superbeginner', 'alice', 1), speak('does-not-exist', 'zz', 2)];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });

  it('treats users who later stopped speaking as still counted within the window', () => {
    // 「退室後も 6 時間ウィンドウ内なら活動ユーザーとしてカウントする」仕様
    const rows: Row[] = [
      speak('superbeginner', 'alice', 1),
      speak('superbeginner', 'alice', 2),
      speak('superbeginner', 'bob', 3),
    ];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 2 });
  });

  // ツーショットチャットの人数は席の数で数える。公開ログに残る過去の 2shot の発言では数えない
  it('公開ログの 2shot の発言は数えない', () => {
    const rows: Row[] = [speak('2shot', 'alice', 1), speak('superbeginner', 'bob', 2)];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });

  it('returns empty object for empty input', () => {
    expect(aggregateCountsFromRows([])).toEqual({});
  });

  it('skips rows without name', () => {
    const rows: Row[] = [
      { ...speak('superbeginner', '', 1), name: '' },
      { ...speak('superbeginner', null as unknown as string, 2), name: null },
      speak('superbeginner', 'alice', 3),
    ];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });
});

// supabase-js を使わず PostgREST へ直接投げる (トップページに約 50kB gz を載せないため)
describe('buildRoomCountsUrl', () => {
  const url = buildRoomCountsUrl('https://example.supabase.co', 1_700_000_000_000);

  it('chats テーブルの REST エンドポイントを指す', () => {
    expect(url.startsWith('https://example.supabase.co/rest/v1/chats?')).toBe(true);
  });

  it('末尾スラッシュを重複させない', () => {
    expect(buildRoomCountsUrl('https://example.supabase.co/', 1)).toContain(
      'https://example.supabase.co/rest/v1/chats?'
    );
  });

  it('supabase-js 版と同じ絞り込みを表現する', () => {
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('time')).toBe('gte.1700000000000');
    expect(params.get('deleted')).toBe('eq.false');
    expect(params.get('order')).toBe('time.asc');
    expect(params.get('limit')).toBe('5000');
    expect(params.get('select')).toBe('room_id,name,system,metadata,time');
    expect(params.get('room_id')?.startsWith('in.(')).toBe(true);
  });

  it('公開ログの 2shot は取得しない', () => {
    const params = new URLSearchParams(url.split('?')[1]);
    const rooms = params.get('room_id')!.slice('in.('.length, -1).split(',');

    expect(rooms).toContain('superbeginner');
    expect(rooms).not.toContain('2shot');
  });
});

describe('toRoomCountMap', () => {
  it('一覧に出す部屋だけにし、公開ログの 2shot は捨てる', () => {
    expect(
      toRoomCountMap([
        { room_id: 'superbeginner', participants: 2 },
        { room_id: '2shot', participants: 4 },
        { room_id: 'not-a-room', participants: 5 },
        { room_id: 'hajime', participants: 0 },
      ])
    ).toEqual({ superbeginner: 2 });
  });
});

describe('countTwoShotSeats', () => {
  it('待機中は 1 人、満室は 2 人、空室は 0 人で合計する', () => {
    expect(
      countTwoShotSeats([
        { room_id: '01', status: 'waiting', sex: 'F', name: 'はなこ', profile: '' },
        { room_id: '02', status: 'full', sex: null, name: null, profile: null },
        { room_id: '03', status: 'empty', sex: null, name: null, profile: null },
      ])
    ).toBe(3);
    expect(countTwoShotSeats([])).toBe(0);
  });

  it('形の違う応答は null', () => {
    expect(countTwoShotSeats({ rows: [] })).toBeNull();
    expect(countTwoShotSeats([{ room_id: '01', status: 'busy' }])).toBeNull();
    expect(countTwoShotSeats([null])).toBeNull();
  });
});

describe('fetchRoomParticipantCounts', () => {
  const ORIGINAL_FETCH = globalThis.fetch;
  const COUNTS_RPC = 'https://example.supabase.co/rest/v1/rpc/room_participant_counts';
  const LOBBY_RPC = 'https://example.supabase.co/rest/v1/rpc/two_shot_lobby';
  const ROWS = 'https://example.supabase.co/rest/v1/chats?';

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  type Reply = () => Promise<Response> | Response;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  /** URL ごとに応答を決める。決めていない URL は 500 */
  function mockFetch(routes: { counts?: Reply; lobby?: Reply; rows?: Reply }) {
    // RequestInit を明示すると eslint の no-undef に当たる (TS の DOM 型は認識されない)。
    // fetch のシグネチャから引くことで型も維持しつつ回避する。
    const spy = vi.fn((...args: Parameters<typeof fetch>) => {
      const url = String(args[0]);
      const reply =
        url === COUNTS_RPC
          ? routes.counts
          : url === LOBBY_RPC
            ? routes.lobby
            : url.startsWith(ROWS)
              ? routes.rows
              : undefined;
      return reply ? reply() : new Response('unexpected', { status: 500 });
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  const rows = [
    { room_id: 'superbeginner', name: 'ゆい', system: false, metadata: null, time: 1 },
    { room_id: 'superbeginner', name: 'ゆい', system: false, metadata: null, time: 2 },
    { room_id: 'superbeginner', name: 'たろ', system: false, metadata: null, time: 3 },
    { room_id: '2shot', name: 'むかし', system: false, metadata: null, time: 4 },
  ];
  const counts = [
    { room_id: 'superbeginner', participants: 2 },
    { room_id: '2shot', participants: 7 },
  ];
  const lobby = [
    { room_id: '01', status: 'waiting', sex: 'M', name: 'たろ', profile: '' },
    { room_id: '02', status: 'full', sex: null, name: null, profile: null },
    { room_id: '03', status: 'empty', sex: null, name: null, profile: null },
  ];

  it('apikey / Authorization を付けて、参加人数の RPC と two-shot の空室状況を並行して POST で呼ぶ', async () => {
    const spy = mockFetch({ counts: () => json([]), lobby: () => json([]) });

    await fetchRoomParticipantCounts(60_000);

    expect(spy).toHaveBeenCalledTimes(2);
    const calls = new Map(spy.mock.calls.map(([url, init]) => [String(url), init]));
    for (const url of [COUNTS_RPC, LOBBY_RPC]) {
      const init = calls.get(url);
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers.apikey).toBe('anon-key');
      expect(headers.Authorization).toBe('Bearer anon-key');
    }
    const body = JSON.parse(String(calls.get(COUNTS_RPC)?.body)) as { since_ms: number };
    expect(Date.now() - body.since_ms).toBeGreaterThanOrEqual(60_000);
    expect(JSON.parse(String(calls.get(LOBBY_RPC)?.body))).toEqual({});
  });

  it('2shot は公開ログの人数ではなく、席に着いている人数にする', async () => {
    mockFetch({ counts: () => json(counts), lobby: () => json(lobby) });

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({
      superbeginner: 2,
      '2shot': 3,
    });
  });

  it('誰も席にいなければ 2shot は出さない（0人）', async () => {
    mockFetch({ counts: () => json(counts), lobby: () => json([lobby[2]]) });

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({ superbeginner: 2 });
  });

  // マイグレーションを適用する前に配信しても、参加人数の表示が壊れないようにする
  it('RPC がまだ無い（404）ときは、従来どおり発言の行を取得して数える（2shot の行は数えない）', async () => {
    const spy = mockFetch({
      counts: () => new Response('{"code":"PGRST202"}', { status: 404 }),
      rows: () => json(rows),
      lobby: () => json(lobby),
    });

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({
      superbeginner: 2,
      '2shot': 3,
    });
    expect(spy).toHaveBeenCalledTimes(3);
    const rowsUrl = spy.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith(ROWS));
    expect(new URLSearchParams(rowsUrl!.split('?')[1]).get('room_id')).not.toContain('2shot');
  });

  it('two-shot の空室状況だけ失敗しても、ほかの部屋の人数は残す', async () => {
    for (const lobbyReply of [
      () => new Response('{"code":"PGRST202"}', { status: 404 }),
      () => new Response('nope', { status: 500 }),
      () => json({ unexpected: true }),
      () => Promise.reject(new Error('offline')),
    ]) {
      mockFetch({ counts: () => json(counts), lobby: lobbyReply });
      await expect(fetchRoomParticipantCounts()).resolves.toEqual({ superbeginner: 2 });
    }
  });

  it('参加人数の RPC だけ失敗しても、2shot の人数は残す', async () => {
    mockFetch({ counts: () => new Response('nope', { status: 500 }), lobby: () => json(lobby) });
    await expect(fetchRoomParticipantCounts()).resolves.toEqual({ '2shot': 3 });

    mockFetch({
      counts: () => new Response('', { status: 404 }),
      rows: () => new Response('nope', { status: 500 }),
      lobby: () => json(lobby),
    });
    await expect(fetchRoomParticipantCounts()).resolves.toEqual({ '2shot': 3 });
  });

  // 環境変数が無い環境 (Storybook / CI の一部) で通信しない既存挙動を保つ
  it('Supabase 未設定なら通信せず空を返す', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const spy = mockFetch({ counts: () => json([]), lobby: () => json([]) });

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('どちらも非 2xx なら空を返す (人数バッジ非表示へフォールバック)', async () => {
    mockFetch({});

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({});
  });

  it('通信が例外を投げても空を返す', async () => {
    mockFetch({
      counts: () => Promise.reject(new Error('offline')),
      lobby: () => Promise.reject(new Error('offline')),
    });

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({});
  });
});
