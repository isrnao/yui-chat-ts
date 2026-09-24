import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { NAMED_CHAR_REFS, decodeCharRefs } from './decodeCharRefs';

// 今のブラウザの解釈（jsdom の HTML パーサー）。textarea の中は文字参照だけが展開され、タグは文字のまま残る
function browserDecode(html: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.textContent;
}

describe('decodeCharRefs', () => {
  it('&hearts; と &#9829; と &#x2665; はどれも ♥ になる', () => {
    expect(decodeCharRefs('&hearts;')).toBe('♥');
    expect(decodeCharRefs('&#9829;')).toBe('♥');
    expect(decodeCharRefs('&#x2665;')).toBe('♥');
    expect(decodeCharRefs('&#X2665;')).toBe('♥');
    expect(decodeCharRefs('すき&hearts;です&#9829;')).toBe('すき♥です♥');
  });

  it('&lt;b&gt; はタグにならず <b> という文字になる', () => {
    expect(decodeCharRefs('&lt;b&gt;太字&lt;/b&gt;')).toBe('<b>太字</b>');
  });

  it('知らない参照・; のない参照・形の崩れた参照はそのまま残す', () => {
    for (const text of [
      '&foo;',
      '&Hearts;',
      '&hearts',
      '&copy',
      '& hearts;',
      '&#;',
      '&#x;',
      '&#xZZ;',
      '&',
      '&&;',
    ]) {
      expect(decodeCharRefs(text)).toBe(text);
    }
  });

  it('展開は 1 回だけ（&amp;hearts; は &hearts; という文字になる）', () => {
    expect(decodeCharRefs('&amp;hearts;')).toBe('&hearts;');
    expect(decodeCharRefs('&amp;#9829;')).toBe('&#9829;');
  });

  it('名前は大文字と小文字を区別する', () => {
    expect(decodeCharRefs('&Alpha;&alpha;&Dagger;&dagger;')).toBe('Αα‡†');
  });

  it('数値の参照は HTML Standard のとおり（0・サロゲート・範囲外は U+FFFD、0x80〜0x9F は Windows-1252）', () => {
    const replacement = String.fromCodePoint(0xfffd);
    expect(decodeCharRefs('&#0;')).toBe(replacement);
    expect(decodeCharRefs('&#xD800;')).toBe(replacement);
    expect(decodeCharRefs('&#x110000;')).toBe(replacement);
    expect(decodeCharRefs('&#99999999999999999999999;')).toBe(replacement);
    expect(decodeCharRefs('&#150;')).toBe('–');
    expect(decodeCharRefs('&#x81;')).toBe(String.fromCodePoint(0x81));
    expect(decodeCharRefs('&#128512;')).toBe('😀');
    expect(decodeCharRefs('&#0009829;')).toBe('♥');
  });

  it('表の 253 個はどれも今のブラウザと同じ文字になる', () => {
    expect(NAMED_CHAR_REFS.size).toBe(253);
    for (const name of NAMED_CHAR_REFS.keys()) {
      expect(decodeCharRefs(`&${name};`), name).toBe(browserDecode(`&${name};`));
    }
  });

  it('数値の参照はどの値でも今のブラウザと同じ文字になる', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x11_0010 }), fc.boolean(), (value, hex) => {
        const ref = hex ? `&#x${value.toString(16)};` : `&#${value};`;
        expect(decodeCharRefs(ref)).toBe(browserDecode(ref));
      }),
      { numRuns: 2000 }
    );
    for (let value = 0; value <= 0xa0; value++) {
      expect(decodeCharRefs(`&#${value};`), String(value)).toBe(browserDecode(`&#${value};`));
    }
  });

  it('& を &amp; にした文字列を展開すると元に戻る', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (text) => {
        expect(decodeCharRefs(text.replace(/&/g, '&amp;'))).toBe(text);
      })
    );
  });

  it('& を含まない文字列はそのまま返す', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        fc.pre(!text.includes('&'));
        expect(decodeCharRefs(text)).toBe(text);
      })
    );
  });
});
