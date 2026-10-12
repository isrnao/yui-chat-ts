import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscribePageReturn } from './pageReturn';

let visibility: 'visible' | 'hidden' = 'visible';
const setVisibility = (next: 'visible' | 'hidden') => {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
};
const pageshow = (persisted: boolean) =>
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  visibility = 'visible';
});

it('隠れていた時間を通知する（表示していた時間は数えない）', () => {
  const listener = vi.fn();
  const unsubscribe = subscribePageReturn(listener);
  vi.advanceTimersByTime(600_000);
  setVisibility('hidden');
  vi.advanceTimersByTime(2_000);
  setVisibility('visible');
  vi.advanceTimersByTime(50);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ hiddenMs: 2_000, persisted: false });
  unsubscribe();
});

it('BFCache からの復帰は visibilitychange と pageshow を 1 回の通知にまとめる', () => {
  const listener = vi.fn();
  const unsubscribe = subscribePageReturn(listener);
  setVisibility('hidden');
  vi.advanceTimersByTime(5_000);
  pageshow(true);
  setVisibility('visible');
  vi.advanceTimersByTime(50);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ hiddenMs: 5_000, persisted: true });
  unsubscribe();
});

it('最初の読み込みの pageshow では通知しない', () => {
  const listener = vi.fn();
  const unsubscribe = subscribePageReturn(listener);
  pageshow(false);
  vi.advanceTimersByTime(50);
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});
