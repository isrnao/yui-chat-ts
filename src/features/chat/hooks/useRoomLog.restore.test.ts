import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRoomLogStore } from '@features/chat/api/roomLogStore';
import { useRoomLog } from './useRoomLog';

function setup() {
  const store = createRoomLogStore({
    initialLimit: 10,
    fetch: () => new Promise(() => {}),
    subscribe: () => ({ unsubscribe() {} }),
  });
  const reload = vi.spyOn(store, 'reload');
  const hook = renderHook(() => useRoomLog(store));
  return { reload, ...hook };
}

let visibility: 'visible' | 'hidden' = 'visible';
function setVisibility(next: 'visible' | 'hidden') {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useRoomLog の復帰時の取り直し', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    visibility = 'visible';
  });

  it('onClick に渡された reload はイベントを reason として受け取らない', () => {
    const { reload, result } = setup();
    act(() => (result.current.reload as (event: unknown) => void)(new MouseEvent('click')));
    expect(reload).toHaveBeenLastCalledWith();
  });

  it('表示していた時間ではなく、隠れていた時間で取り直すかを決める', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { reload } = setup();
    // ページへ戻った通知は、BFCache の pageshow と 1 回にまとめるため少し遅れて届く
    const returnAfter = (hiddenMs: number) =>
      act(() => {
        setVisibility('hidden');
        vi.advanceTimersByTime(hiddenMs);
        setVisibility('visible');
        vi.advanceTimersByTime(50);
      });

    // 10 分表示したあと、2 秒だけ別のタブへ行って戻る
    act(() => vi.advanceTimersByTime(600_000));
    returnAfter(2_000);
    expect(reload).not.toHaveBeenCalledWith('reconnect');

    // 1 分以上隠れていたら取り直す
    returnAfter(60_000);
    expect(reload).toHaveBeenCalledWith('reconnect');
    vi.useRealTimers();
  });
});
