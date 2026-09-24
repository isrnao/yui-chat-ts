import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { callTwoShot, fetchLobby, REQUEST_TIMEOUT_MS } from './twoShotApi';
import { createEntryToken } from './token';
import { parseSession, sessionStore } from './sessionStore';
import { entryStore } from './entryStore';
import { createLobbyStore } from './lobbyStore';
import { getRoomResource, seedRoomResource } from './roomResource';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const TOKEN = createEntryToken(1_790_000_000_000);
const ROOM = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/functions/two-shot/fixtures/room.json'), 'utf8')
) as { room: import('../../../../supabase/functions/two-shot/rules.ts').RoomView };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('入室トークン', () => {
  it('v1.<作成時刻>.<32 バイトの base64url> の形', () => {
    expect(TOKEN).toMatch(/^v1\.1790000000000\.[A-Za-z0-9_-]{43}$/);
    expect(createEntryToken(1)).not.toBe(createEntryToken(1));
  });
});

describe('API クライアント', () => {
  it('Edge Function にトークンをヘッダで送り、応答を検証して返す', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(ROOM));
    const result = await callTwoShot({ room: '01', op: 'read' }, TOKEN);
    expect(result).toEqual(ROOM);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/functions/v1/two-shot');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-two-shot-token']).toBe(TOKEN);
    expect(headers.apikey).toBe('anon-key');
    expect(init?.body).toBe(JSON.stringify({ room: '01', op: 'read' }));
  });

  it('通信の失敗・4xx / 5xx・形の違う応答・環境変数の不足は failed', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(jsonResponse({ error: 'x' }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: 'maybe' }));
    expect(await callTwoShot({ room: '01', op: 'read' }, null)).toBe('failed');
    expect(await callTwoShot({ room: '01', op: 'read' }, null)).toBe('failed');
    expect(await callTwoShot({ room: '01', op: 'read' }, null)).toBe('failed');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(await callTwoShot({ room: '01', op: 'read' }, null)).toBe('failed');
  });

  it('10 秒で打ち切る', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    const pending = callTwoShot({ room: '01', op: 'read' }, null);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toBe('failed');
  });

  it('公開一覧は RPC を POST で呼ぶ', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse([{ room_id: '01', status: 'full', sex: null, name: null, profile: null }])
      );
    expect(await fetchLobby()).toEqual({ '01': { status: 'full' } });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.supabase.co/rest/v1/rpc/two_shot_lobby'
    );
  });
});

describe('Session のストア', () => {
  it('保存・読み出し・トークンが同じときだけ消す', () => {
    expect(sessionStore.getSnapshot()).toBeNull();
    sessionStore.set({
      status: 'active',
      token: TOKEN,
      roomId: '01',
      seat: 0,
      me: { name: 'a', sex: 'M' },
    });
    const snapshot = sessionStore.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'active', roomId: '01' });
    expect(sessionStore.getSnapshot()).toBe(snapshot); // 同じ値なら同じ参照
    sessionStore.clearIfToken(createEntryToken(1));
    expect(sessionStore.getSnapshot()).not.toBeNull();
    sessionStore.clearIfToken(TOKEN);
    expect(sessionStore.getSnapshot()).toBeNull();
    expect(sessionStore.getServerSnapshot()).toBeNull();
  });

  it('古い形・不正な値は Session として使わない', () => {
    expect(
      parseSession({
        status: 'active',
        token: TOKEN,
        roomId: '01',
        seat: 0,
        me: { name: 'a', sex: 'M' },
      })
    ).toBeNull();
    expect(
      parseSession({
        v: 1,
        status: 'active',
        token: 'x',
        roomId: '01',
        seat: 0,
        me: { name: 'a', sex: 'M' },
      })
    ).toBeNull();
    expect(
      parseSession({
        v: 1,
        status: 'active',
        token: TOKEN,
        roomId: '13',
        seat: 0,
        me: { name: 'a', sex: 'M' },
      })
    ).toBeNull();
    expect(
      parseSession({
        v: 1,
        status: 'pending',
        token: TOKEN,
        request: { room: '01', name: 'a', sex: 'M', profile: '', make: 'no' },
      })
    ).toBeNull();
    sessionStorage.setItem('okiraku:two-shot:session', '{broken');
    expect(sessionStore.getSnapshot()).toBeNull();
  });

  it('sessionStorage が使えなくても、ページの中ではメモリ上の値で動く', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    sessionStore.set({
      status: 'pending',
      token: TOKEN,
      request: { room: '01', name: 'a', sex: 'M', profile: '', make: false },
    });
    expect(sessionStore.getSnapshot()).toMatchObject({ status: 'pending', token: TOKEN });
  });
});

describe('入力値の保存', () => {
  it('ほかの設定と別のキーに保存し、不正な値は無視する', () => {
    entryStore.update({ name: 'はなこ', sex: 'F', profile: 'よろしく' });
    expect(JSON.parse(localStorage.getItem('okiraku:two-shot:entry')!)).toEqual({
      name: 'はなこ',
      sex: 'F',
      profile: 'よろしく',
    });
    localStorage.setItem('okiraku:two-shot:entry', JSON.stringify({ name: 1 }));
    expect(entryStore.getSnapshot()).toBeNull();
    entryStore.update(null);
    expect(entryStore.getSnapshot()).toBeNull();
  });
});

describe('一覧のストア', () => {
  it('最初の購読で取得し、reload で取り直す。失敗したら error', async () => {
    const fetcher = vi
      .fn<Parameters<typeof createLobbyStore>[0] & object>()
      .mockResolvedValueOnce({ '01': { status: 'full' } })
      .mockResolvedValueOnce('failed');
    const store = createLobbyStore(fetcher);
    expect(store.getSnapshot()).toEqual({ kind: 'idle' });
    const unsubscribe = store.subscribe(() => {});
    await vi.waitFor(() =>
      expect(store.getSnapshot()).toEqual({ kind: 'loaded', rows: { '01': { status: 'full' } } })
    );
    store.reload();
    await vi.waitFor(() => expect(store.getSnapshot()).toEqual({ kind: 'error' }));
    unsubscribe();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('取得中の reload は重ねない。購読を外すと中断して、次の購読で取り直す', async () => {
    let resolve!: (value: Record<string, never>) => void;
    const fetcher = vi.fn(() => new Promise<Record<string, never>>((r) => (resolve = r)));
    const store = createLobbyStore(fetcher);
    const unsubscribe = store.subscribe(() => {});
    store.reload();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const signal = fetcher.mock.calls[0] as unknown as [AbortSignal];
    unsubscribe();
    await Promise.resolve();
    expect((signal[0] as AbortSignal).aborted).toBe(true);
    resolve({});
    expect(store.getSnapshot()).toEqual({ kind: 'idle' }); // 中断した取得の結果は捨てる
    store.subscribe(() => {});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('入室後の初期取得', () => {
  const session = {
    status: 'active',
    token: TOKEN,
    roomId: '01',
    seat: 1,
    me: { name: 'x', sex: 'M' },
  } as const;

  it('入室の応答を渡したときは取り直さない', () => {
    const fetcher = vi.fn();
    seedRoomResource(TOKEN, ROOM.room);
    const resource = getRoomResource(session, fetcher);
    const unsubscribe = resource.subscribe(() => {});
    expect(resource.getSnapshot()).toEqual({ kind: 'ready', view: ROOM.room });
    expect(fetcher).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('再読み込みでは read を 1 回送り、失効していたら Session を消す', async () => {
    sessionStore.set(session);
    const fetcher = vi.fn().mockResolvedValue({ ok: false, notice: 'E4', placement: 'pane' });
    const resource = getRoomResource(session, fetcher);
    const unsubscribe = resource.subscribe(() => {});
    await vi.waitFor(() => expect(resource.getSnapshot()).toEqual({ kind: 'invalid' }));
    expect(sessionStore.getSnapshot()).toBeNull();
    unsubscribe();
  });

  it('通信に失敗しても Session は消さない', async () => {
    sessionStore.set(session);
    const fetcher = vi.fn().mockResolvedValue('failed');
    const resource = getRoomResource({ ...session, token: createEntryToken(2) }, fetcher);
    const unsubscribe = resource.subscribe(() => {});
    await vi.waitFor(() => expect(resource.getSnapshot()).toEqual({ kind: 'error' }));
    expect(sessionStore.getSnapshot()).not.toBeNull();
    unsubscribe();
  });
});

describe('useAutoRefresh', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('表示中だけ間隔で呼び、非表示では止め、表示に戻ったらすぐ 1 回呼ぶ', () => {
    vi.useFakeTimers();
    setVisibility('visible');
    const onTick = vi.fn();
    const { rerender, unmount } = renderHook(({ enabled }) => useAutoRefresh(20, onTick, enabled), {
      initialProps: { enabled: true },
    });
    act(() => vi.advanceTimersByTime(40_000));
    expect(onTick).toHaveBeenCalledTimes(2);
    act(() => setVisibility('hidden'));
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTick).toHaveBeenCalledTimes(2);
    act(() => setVisibility('visible'));
    expect(onTick).toHaveBeenCalledTimes(3);
    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTick).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('0 秒（なし）では何もしない', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(0, onTick, true));
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTick).not.toHaveBeenCalled();
  });
});
