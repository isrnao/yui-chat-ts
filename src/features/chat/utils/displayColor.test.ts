import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeDisplayColor } from './displayColor';

describe('normalizeDisplayColor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('#rgb・#rrggbb は小文字にする', () => {
    expect(normalizeDisplayColor(' #FF69B4 ')).toBe('#ff69b4');
    expect(normalizeDisplayColor('#F0a')).toBe('#f0a');
    expect(normalizeDisplayColor('#ff69b')).toBeNull();
  });

  it('色名はブラウザが色として読めるものだけ（transparent・currentcolor・記号入りは除く）', () => {
    vi.stubGlobal('CSS', { supports: (_property: string, value: string) => value === 'orangered' });
    expect(normalizeDisplayColor('OrangeRed')).toBe('orangered');
    expect(normalizeDisplayColor('notacolor')).toBeNull();
    expect(normalizeDisplayColor('transparent')).toBeNull();
    expect(normalizeDisplayColor('red;x')).toBeNull();
    expect(normalizeDisplayColor('あか')).toBeNull();
  });
});
