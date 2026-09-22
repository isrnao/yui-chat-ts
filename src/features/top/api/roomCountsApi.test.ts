import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateCountsFromRows,
  buildRoomCountsUrl,
  fetchRoomParticipantCounts,
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
});

describe('fetchRoomParticipantCounts', () => {
  const ORIGINAL_FETCH = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  function mockFetch(impl: () => Promise<Response> | Response) {
    // RequestInit を明示すると eslint の no-undef に当たる (TS の DOM 型は認識されない)。
    // fetch のシグネチャから引くことで型も維持しつつ回避する。
    const spy = vi.fn((..._args: Parameters<typeof fetch>) => impl());
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('apikey / Authorization を付けて PostgREST へ問い合わせる', async () => {
    const spy = mockFetch(() => new Response('[]', { status: 200 }));

    await fetchRoomParticipantCounts();

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(String(url).startsWith('https://example.supabase.co/rest/v1/chats?')).toBe(true);
    const headers = init?.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-key');
    expect(headers.Authorization).toBe('Bearer anon-key');
  });

  it('取得した行から参加人数を集計する', async () => {
    const spy = mockFetch(
      () =>
        new Response(
          JSON.stringify([
            {
              room_id: 'superbeginner',
              name: 'ゆい',
              message: 'やあ',
              system: false,
              metadata: null,
              time: 1,
            },
            {
              room_id: 'superbeginner',
              name: 'ゆい',
              message: 'また',
              system: false,
              metadata: null,
              time: 2,
            },
            {
              room_id: 'superbeginner',
              name: 'たろ',
              message: 'どうも',
              system: false,
              metadata: null,
              time: 3,
            },
          ]),
          { status: 200 }
        )
    );

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({ superbeginner: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // 環境変数が無い環境 (Storybook / CI の一部) で通信しない既存挙動を保つ
  it('Supabase 未設定なら通信せず空を返す', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const spy = mockFetch(() => new Response('[]', { status: 200 }));

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('非 2xx なら空を返す (人数バッジ非表示へフォールバック)', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({});
  });

  it('通信が例外を投げても空を返す', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));

    await expect(fetchRoomParticipantCounts()).resolves.toEqual({});
  });
});
