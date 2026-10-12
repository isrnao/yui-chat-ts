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
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const { reload } = setup();

    // 10 分表示したあと、2 秒だけ別のタブへ行って戻る
    now.mockReturnValue(600_000);
    act(() => setVisibility('hidden'));
    now.mockReturnValue(602_000);
    act(() => setVisibility('visible'));
    expect(reload).not.toHaveBeenCalledWith('reconnect');

    // 1 分以上隠れていたら取り直す
    act(() => setVisibility('hidden'));
    now.mockReturnValue(662_000);
    act(() => setVisibility('visible'));
    expect(reload).toHaveBeenCalledWith('reconnect');
  });
});
