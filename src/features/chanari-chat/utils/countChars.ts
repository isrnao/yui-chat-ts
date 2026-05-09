/**
 * grapheme 単位で文字数をカウントする純関数。
 * Intl.Segmenter が利用可能なら grapheme cluster 単位、
 * 利用不能なら Array.from(input).length（サロゲートペアを 1 文字として扱う）にフォールバック。
 */

// Intl.Segmenter は ES2022 の型定義に含まれているが、
// プロジェクトの tsconfig が ES2020 を lib に指定しているため、
// ランタイムに存在チェックしつつ型をローカル宣言して any を避ける。
type SegmentData = { segment: string };
type Segmenter = {
  segment(input: string): Iterable<SegmentData>;
};
type SegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' }
) => Segmenter;

function getSegmenterCtor(): SegmenterConstructor | null {
  if (typeof Intl === 'undefined') return null;
  const maybeCtor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  return typeof maybeCtor === 'function' ? maybeCtor : null;
}

export function countChars(input: string): number {
  if (input === '') return 0;

  const SegmenterCtor = getSegmenterCtor();
  if (SegmenterCtor) {
    const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' });
    let count = 0;
    for (const _ of segmenter.segment(input)) {
      count++;
    }
    return count;
  }

  return Array.from(input).length;
}
