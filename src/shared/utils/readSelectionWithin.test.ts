import { describe, expect, it } from 'vitest';
import { readSelectionWithin } from './readSelectionWithin';

describe('本文内の範囲選択', () => {
  it('本文内を選べるが隣の発言へまたぐ選択は取り込まない', () => {
    const source = document.createElement('p');
    const outside = document.createElement('p');
    source.textContent = '本文';
    outside.textContent = '隣の発言';
    document.body.append(source, outside);
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(source);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(readSelectionWithin(source, selection)).toBe('本文');
    range.setEnd(outside.firstChild!, 1);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(readSelectionWithin(source, selection)).toBe('');
    selection.removeAllRanges();
    source.remove();
    outside.remove();
  });
});
