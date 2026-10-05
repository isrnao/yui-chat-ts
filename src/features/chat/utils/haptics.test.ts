import { describe, it, expect, vi, afterEach } from 'vitest';
import { tapHaptic } from './haptics';

describe('tapHaptic', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigator.vibrate があれば短く 1 回振動させる', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    tapHaptic();
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(15);
  });

  it('vibrate がない・例外を投げる・false を返すときも投げない', () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined });
    expect(() => tapHaptic()).not.toThrow();
    vi.stubGlobal('navigator', {
      ...navigator,
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => tapHaptic()).not.toThrow();
    vi.stubGlobal('navigator', { ...navigator, vibrate: () => false });
    expect(() => tapHaptic()).not.toThrow();
  });
});
