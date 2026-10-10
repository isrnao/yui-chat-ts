import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countTwoShotSeats, fetchRoomParticipantCounts, toRoomCountMap } from './roomCountsApi';

// ツーショットチャットは hotfix で一時的に止めている（rooms.ts の TWO_SHOT_CHAT_ENABLED）。
// このファイルは再開したときの動作を確かめるので、有効にして動かす。止めている間の動作は twoShotDisabled.test.tsx
vi.mock('@features/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/rooms')>()),
  TWO_SHOT_CHAT_ENABLED: true,
}));

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
  function mockFetch(routes: { counts?: Reply; lobby?: Reply }) {
    // RequestInit を明示すると eslint の no-undef に当たる (TS の DOM 型は認識されない)。
    // fetch のシグネチャから引くことで型も維持しつつ回避する。
    const spy = vi.fn((...args: Parameters<typeof fetch>) => {
      const url = String(args[0]);
      const reply =
        url === COUNTS_RPC ? routes.counts : url === LOBBY_RPC ? routes.lobby : undefined;
      return reply ? reply() : new Response('unexpected', { status: 500 });
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
  }

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

  // RPC は本番に適用済み（Issue #187）。404 でも発言の行（最大 5000 行）を取りに行かない
  it('RPC が 404 でも発言の行は取得せず、ほかの失敗と同じく空にする（2shot の席の人数は残す）', async () => {
    const spy = mockFetch({
      counts: () => new Response('{"code":"PGRST202"}', { status: 404 }),
      lobby: () => json(lobby),
    });

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({ '2shot': 3 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.some(([url]) => String(url).includes('/rest/v1/chats'))).toBe(false);
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
