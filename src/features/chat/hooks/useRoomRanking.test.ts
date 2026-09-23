import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { RANKING_LOADING_DELAY_MS, useRoomRanking } from './useRoomRanking';
import type { RankingEntry } from '@features/chat/utils/chatRanking';
import type { RoomId } from '@features/chat/rooms';

vi.mock('@features/chat/api/chatQueries', () => ({
  loadChatRanking: vi.fn(),
}));

const { loadChatRanking } = await import('@features/chat/api/chatQueries');
const mockedLoad = vi.mocked(loadChatRanking);

const entry = (name: string, count: number): RankingEntry => ({
  name,
  count,
  lastTime: count,
  color: '#000',
  host: '',
});

/** 解決を外から制御できる Promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** then / finally の連鎖を流し切る (フェイクタイマー下では waitFor が使えないため) */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useRoomRanking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedLoad.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('無効の間は取得しない', () => {
    const { result } = renderHook(() => useRoomRanking('anime', false));
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(result.current).toEqual({ ranking: null, isLoading: false, hasError: false });
  });

  // 数 ms で返る取得でも毎回「読み込み中」を出すとチラつく
  it('すぐ返る取得では一度も読み込み中にならない', async () => {
    mockedLoad.mockResolvedValue([entry('A', 3)]);
    const seen: boolean[] = [];
    const { result } = renderHook(() => {
      const state = useRoomRanking('anime', true);
      seen.push(state.isLoading);
      return state;
    });

    await flush();
    advance(RANKING_LOADING_DELAY_MS * 2);

    expect(result.current).toEqual({ ranking: [entry('A', 3)], isLoading: false, hasError: false });
    expect(seen).not.toContain(true);
    expect(mockedLoad).toHaveBeenCalledWith('anime');
  });

  it('取得が長引いたときだけ読み込み中を出す', async () => {
    const pending = deferred<RankingEntry[]>();
    mockedLoad.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useRoomRanking('anime', true));

    advance(RANKING_LOADING_DELAY_MS - 1);
    expect(result.current.isLoading).toBe(false);
    advance(1);
    expect(result.current).toEqual({ ranking: null, isLoading: true, hasError: false });

    pending.resolve([entry('A', 3)]);
    await flush();
    expect(result.current).toEqual({ ranking: [entry('A', 3)], isLoading: false, hasError: false });
  });

  it('開き直したときは前回の結果を出したまま取り直し、終わったら差し替える', async () => {
    mockedLoad.mockResolvedValueOnce([entry('A', 1)]);
    const { result, rerender } = renderHook(({ enabled }) => useRoomRanking('anime', enabled), {
      initialProps: { enabled: true },
    });
    await flush();
    expect(result.current.ranking).toEqual([entry('A', 1)]);

    const pending = deferred<RankingEntry[]>();
    mockedLoad.mockReturnValueOnce(pending.promise);
    rerender({ enabled: false });
    rerender({ enabled: true });

    // 取り直しが長引いても前回の結果を出し続ける (空にも読み込み中にもしない)
    advance(RANKING_LOADING_DELAY_MS * 2);
    expect(result.current.ranking).toEqual([entry('A', 1)]);

    pending.resolve([entry('A', 2)]);
    await flush();
    expect(result.current).toEqual({ ranking: [entry('A', 2)], isLoading: false, hasError: false });
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('失敗したら hasError を立て、前回の結果は残す', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('boom'));
    const { result, rerender } = renderHook(({ enabled }) => useRoomRanking('anime', enabled), {
      initialProps: { enabled: true },
    });
    await flush();
    expect(result.current).toEqual({ ranking: null, isLoading: false, hasError: true });

    mockedLoad.mockResolvedValueOnce([entry('A', 1)]);
    rerender({ enabled: false });
    rerender({ enabled: true });
    // 開き直したら前回の失敗表示は消す
    expect(result.current.hasError).toBe(false);
    await flush();
    expect(result.current.ranking).toEqual([entry('A', 1)]);

    mockedLoad.mockRejectedValueOnce(new Error('boom'));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await flush();
    expect(result.current).toEqual({ ranking: [entry('A', 1)], isLoading: false, hasError: true });
  });

  it('部屋が変わったら前の部屋の結果を出さず、遅れて届いた結果も捨てる', async () => {
    mockedLoad.mockResolvedValueOnce([entry('A', 1)]);
    const { result, rerender } = renderHook(
      ({ roomId }: { roomId: RoomId }) => useRoomRanking(roomId, true),
      { initialProps: { roomId: 'anime' } }
    );
    await flush();
    expect(result.current.ranking).toEqual([entry('A', 1)]);

    const late = deferred<RankingEntry[]>();
    mockedLoad.mockReturnValueOnce(late.promise).mockResolvedValueOnce([entry('C', 7)]);
    rerender({ roomId: 'game' });
    // 前の部屋の結果は即座に消える
    expect(result.current.ranking).toBeNull();

    rerender({ roomId: 'hajime' });
    late.resolve([entry('B', 99)]);
    await flush();
    expect(result.current.ranking).toEqual([entry('C', 7)]);
  });
});
