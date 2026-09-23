import { describe, it, expect, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useChanariSettings } from './useChanariSettings';
import { STORAGE_KEY, ONE_YEAR_MS, saveDraft } from '../utils/draftStore';

function storedDrafts(): Record<string, Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
    string,
    Record<string, unknown>
  >;
}

describe('useChanariSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Strict Mode でも保存は 1 回で、保存した値を返す', () => {
    const { result } = renderHook(() => useChanariSettings('durarara'), { wrapper: StrictMode });

    act(() => {
      result.current.updateSettings({ name: 'ゆい' });
    });

    expect(storedDrafts().durarara).toMatchObject({ roomId: 'durarara', name: 'ゆい', version: 1 });
    expect(result.current.settings.name).toBe('ゆい');
  });

  it('同一 tick 内の連続更新をマージして保存する', () => {
    const { result } = renderHook(() => useChanariSettings('durarara'));

    act(() => {
      result.current.updateSettings({ name: 'ゆい' });
      result.current.updateSettings({ nameColor: '#ff69b4' });
    });

    expect(storedDrafts().durarara).toMatchObject({ name: 'ゆい', nameColor: '#ff69b4' });
    expect(result.current.settings).toMatchObject({ name: 'ゆい', nameColor: '#ff69b4' });
  });

  it('roomId が変わると別 room の draft を読む', () => {
    saveDraft({ roomId: 'hajime', name: 'はじめ' });

    const { result, rerender } = renderHook(({ roomId }) => useChanariSettings(roomId), {
      initialProps: { roomId: 'durarara' },
    });

    expect(result.current.settings).toEqual({});

    rerender({ roomId: 'hajime' });

    expect(result.current.settings.name).toBe('はじめ');
  });

  it('他の部屋の下書きを壊さずに保存する', () => {
    saveDraft({ roomId: 'hajime', name: 'はじめ' });
    const { result } = renderHook(() => useChanariSettings('durarara'));

    act(() => {
      result.current.updateSettings({ name: 'ゆい' });
    });

    expect(Object.keys(storedDrafts()).sort()).toEqual(['durarara', 'hajime']);
  });

  it('1 年より古い下書きや未来の日付の下書きは読まない', () => {
    const now = Date.now();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        old: { version: 1, roomId: 'old', name: '古い', updatedAt: now - ONE_YEAR_MS - 1000 },
        future: { version: 1, roomId: 'future', name: '未来', updatedAt: now + 60_000 },
      })
    );

    expect(renderHook(() => useChanariSettings('old')).result.current.settings).toEqual({});
    expect(renderHook(() => useChanariSettings('future')).result.current.settings).toEqual({});
  });
});
