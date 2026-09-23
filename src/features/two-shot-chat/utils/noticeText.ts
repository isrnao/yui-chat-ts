import {
  ERROR_PAGES,
  noticeName,
  noticeParts,
  type ErrorCode,
  type NoticeLine,
  type NoticePart,
} from '../../../../supabase/functions/two-shot/rules.ts';

/**
 * お知らせ（N1〜N10）とお知らせ画面（E1〜E12）の文言。文言そのものは rules.ts が唯一の定義で、
 * 容量の計算と同じものを表示に使う。ここでは表示の形（性別は色付きにするため断片のまま）にするだけ。
 */

export type NoticeView = { name: string; parts: NoticePart[] };

export function noticeView(line: NoticeLine): NoticeView {
  return { name: noticeName(line.code), parts: noticeParts(line) };
}

export function errorPage(code: ErrorCode): { title: string; lines: readonly string[] } {
  return ERROR_PAGES[code];
}
