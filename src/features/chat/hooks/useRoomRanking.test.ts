import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoomRanking } from './useRoomRanking';
import type { RankingEntry } from '@features/chat/utils/chatRanking';

vi.mock('@features/chat/api/chatApi', () => ({
  loadChatRanking: vi.fn(),
}));

const { loadChatRanking } = await import('@features/chat/api/chatApi');
const mockedLoad = vi.mocked(loadChatRanking);

const entry = (name: string, count: number): RankingEntry => ({
  name,
  count,
  lastTime: count,
  color: '#000',
  host: '',
});

describe('useRoomRanking', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
  });

  it('無効の間は取得しない', () => {
    const { result } = renderHook(() => useRoomRanking('anime', false));
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(result.current).toEqual({ ranking: [], isLoading: false, hasError: false });
  });

  it('有効になると取得し、結果を返す', async () => {
    mockedLoad.mockResolvedValue([entry('A', 3)]);
    const { result } = renderHook(() => useRoomRanking('anime', true));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ranking).toEqual([entry('A', 3)]);
    expect(mockedLoad).toHaveBeenCalledWith('anime');
  });

  it('失敗したら hasError を立てる', async () => {
    mockedLoad.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRoomRanking('anime', true));

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current).toEqual({ ranking: [], isLoading: false, hasError: true });
  });

  it('開き直すたびに取り直す (閉じている間の発言を反映する)', async () => {
    mockedLoad.mockResolvedValueOnce([entry('A', 1)]).mockResolvedValueOnce([entry('A', 2)]);
    const { result, rerender } = renderHook(({ enabled }) => useRoomRanking('anime', enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.ranking).toEqual([entry('A', 1)]));

    rerender({ enabled: false });
    rerender({ enabled: true });

    // 前回の結果は捨てて読み込み中に戻る
    expect(result.current).toEqual({ ranking: [], isLoading: true, hasError: false });
    await waitFor(() => expect(result.current.ranking).toEqual([entry('A', 2)]));
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('部屋が変わったら前の部屋の結果を出さない', async () => {
    let resolveFirst: (value: RankingEntry[]) => void = () => {};
    mockedLoad
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([entry('B', 5)]);
    const { result, rerender } = renderHook(({ roomId }) => useRoomRanking(roomId, true), {
      initialProps: { roomId: 'anime' as const as 'anime' | 'game' },
    });

    rerender({ roomId: 'game' });
    // 遅れて届いた前の部屋の結果は捨てる
    resolveFirst([entry('A', 99)]);

    await waitFor(() => expect(result.current.ranking).toEqual([entry('B', 5)]));
  });
});
