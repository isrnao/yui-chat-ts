import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useChanariSettings } from './useChanariSettings';

const { loadDraft, saveDraft } = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
}));

vi.mock('../utils/draftStore', () => ({
  loadDraft,
  saveDraft,
}));

describe('useChanariSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadDraft.mockReturnValue(null);
  });

  // 回帰テスト: 以前は setSettings の updater 内で saveDraft を呼んでいたため、
  // updater が純粋でなく Strict Mode の二重呼び出しで副作用も 2 回走っていた
  it('Strict Mode でも保存の副作用が 1 回だけ走る', () => {
    const { result } = renderHook(() => useChanariSettings('durarara'), { wrapper: StrictMode });

    act(() => {
      result.current.updateSettings({ name: 'ゆい' });
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith({ roomId: 'durarara', name: 'ゆい' });
    expect(result.current.settings.name).toBe('ゆい');
  });

  it('同一 tick 内の連続更新をマージして保存する', () => {
    const { result } = renderHook(() => useChanariSettings('durarara'));

    act(() => {
      result.current.updateSettings({ name: 'ゆい' });
      result.current.updateSettings({ nameColor: '#ff69b4' });
    });

    expect(saveDraft).toHaveBeenLastCalledWith({
      roomId: 'durarara',
      name: 'ゆい',
      nameColor: '#ff69b4',
    });
    expect(result.current.settings).toEqual({ name: 'ゆい', nameColor: '#ff69b4' });
  });

  it('roomId が変わると別 room の draft を読み直す', () => {
    loadDraft.mockImplementation((roomId: string) =>
      roomId === 'hajime' ? { version: 1, roomId, name: 'はじめ', updatedAt: Date.now() } : null
    );

    const { result, rerender } = renderHook(({ roomId }) => useChanariSettings(roomId), {
      initialProps: { roomId: 'durarara' },
    });

    expect(result.current.settings).toEqual({});

    rerender({ roomId: 'hajime' });

    expect(result.current.settings.name).toBe('はじめ');
  });
});
