/**
 * 発言やプロフィールに書かれた HTML の文字参照を文字に戻す（requirements.md Requirement 7.10、research.md O12）。
 *
 * 原作は `<` `>` だけを実体参照にして HTML に埋め込んでいたので、`&hearts;` や `&#9829;` はブラウザが記号にしていた。
 * ここでは文字参照だけを 1 回で展開し、結果は React が文字として描く（`&lt;b&gt;` は `<b>` という文字になる）。
 * `innerHTML` は使わない。
 *
 * - 名前付きの参照は、原作の時代のブラウザが解釈した HTML 4.01 の 252 個と `&apos;`。値は今のブラウザと同じ
 *   （HTML Standard）にする。`;` のない参照（`&copy` など）は展開しない
 * - 数値の参照は HTML Standard の規則に従う（0・サロゲート・範囲外は U+FFFD、0x80〜0x9F は Windows-1252 の文字）
 */

// U+00A0 から U+00FF まで、順に 1 つずつ
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr ' +
  'deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
  'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml ' +
  'eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';

// U+0391 から（U+03A2 は欠番）と U+03B1 から、順に 1 つずつ
const GREEK_UPPER =
  'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - ' +
  'Sigma Tau Upsilon Phi Chi Psi Omega';
const GREEK_LOWER =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf ' +
  'sigma tau upsilon phi chi psi omega';

// 名前とコードポイント（10 進）の組
const OTHERS =
  'quot 34 amp 38 apos 39 lt 60 gt 62 OElig 338 oelig 339 Scaron 352 scaron 353 Yuml 376 fnof 402 ' +
  'circ 710 tilde 732 thetasym 977 upsih 978 piv 982 ' +
  'ensp 8194 emsp 8195 thinsp 8201 zwnj 8204 zwj 8205 lrm 8206 rlm 8207 ndash 8211 mdash 8212 ' +
  'lsquo 8216 rsquo 8217 sbquo 8218 ldquo 8220 rdquo 8221 bdquo 8222 dagger 8224 Dagger 8225 ' +
  'bull 8226 hellip 8230 permil 8240 prime 8242 Prime 8243 lsaquo 8249 rsaquo 8250 oline 8254 ' +
  'frasl 8260 euro 8364 image 8465 weierp 8472 real 8476 trade 8482 alefsym 8501 ' +
  'larr 8592 uarr 8593 rarr 8594 darr 8595 harr 8596 crarr 8629 lArr 8656 uArr 8657 rArr 8658 ' +
  'dArr 8659 hArr 8660 forall 8704 part 8706 exist 8707 empty 8709 nabla 8711 isin 8712 notin 8713 ' +
  'ni 8715 prod 8719 sum 8721 minus 8722 lowast 8727 radic 8730 prop 8733 infin 8734 ang 8736 ' +
  'and 8743 or 8744 cap 8745 cup 8746 int 8747 there4 8756 sim 8764 cong 8773 asymp 8776 ne 8800 ' +
  'equiv 8801 le 8804 ge 8805 sub 8834 sup 8835 nsub 8836 sube 8838 supe 8839 oplus 8853 ' +
  'otimes 8855 perp 8869 sdot 8901 lceil 8968 rceil 8969 lfloor 8970 rfloor 8971 ' +
  // HTML 4.01 では U+2329 / U+232A だったが、今のブラウザは U+27E8 / U+27E9 にする
  'lang 10216 rang 10217 loz 9674 spades 9824 clubs 9827 hearts 9829 diams 9830';

function buildNamed(): ReadonlyMap<string, number> {
  const named = new Map<string, number>();
  const run = (names: string, first: number) =>
    names.split(' ').forEach((name, offset) => {
      if (name !== '-') named.set(name, first + offset);
    });
  run(LATIN1, 0xa0);
  run(GREEK_UPPER, 0x391);
  run(GREEK_LOWER, 0x3b1);
  const pairs = OTHERS.split(' ');
  for (let i = 0; i < pairs.length; i += 2) named.set(pairs[i], Number(pairs[i + 1]));
  return named;
}

/** 表の中身（テストで今のブラウザの解釈と突き合わせる） */
export const NAMED_CHAR_REFS = buildNamed();

// 0x80〜0x9F の数値の参照は Windows-1252 の文字として扱う（HTML Standard）。表にないものはそのまま
const WINDOWS_1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x2c6,
  0x89: 0x2030,
  0x8a: 0x160,
  0x8b: 0x2039,
  0x8c: 0x152,
  0x8e: 0x17d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x2dc,
  0x99: 0x2122,
  0x9a: 0x161,
  0x9b: 0x203a,
  0x9c: 0x153,
  0x9e: 0x17e,
  0x9f: 0x178,
};

const REPLACEMENT = String.fromCodePoint(0xfffd);

function fromNumeric(value: number): string {
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return REPLACEMENT;
  return String.fromCodePoint(WINDOWS_1252[value] ?? value);
}

const CHAR_REF = /&(?:#(\d+)|#[xX]([0-9A-Fa-f]+)|([A-Za-z][A-Za-z0-9]*));/g;

export function decodeCharRefs(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    CHAR_REF,
    (ref, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) {
        const codePoint = NAMED_CHAR_REFS.get(name);
        return codePoint === undefined ? ref : String.fromCodePoint(codePoint);
      }
      // 桁の多すぎる値は Infinity か 0x10FFFF を超える数になり、U+FFFD になる
      return fromNumeric(decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? '', 16));
    }
  );
}
