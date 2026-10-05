import type { Chat } from '@features/chat/types';
import { isFilterableIp } from './ipFilterStore';

/** 行の中の、ダブルタップでフィルタの種類を決める要素に付ける属性（値は name / message） */
export const FILTER_TARGET_ATTR = 'data-filter-target';
/** 名前の要素に付ける、フィルタする名前（管理人の入退室メッセージの入室者など、表示名と違うとき） */
export const FILTER_NAME_ATTR = 'data-filter-name';

/**
 * ダブルタップで開くフィルタの確認（.kiro/specs/chat-ip-mute Requirement 9）。
 * - ip: 名前・本文以外（時刻・IP・余白・アバター）を押したとき
 * - name: 名前を押したとき
 * - word: 本文を押したとき。selected はダブルクリックでブラウザが選んだ文字（なければ空）
 * row は消えるアニメーションのための行の要素
 */
export type FilterRequest =
  | { kind: 'ip'; ip: string; row: HTMLElement }
  | { kind: 'name'; name: string; row: HTMLElement }
  | { kind: 'word'; message: string; selected: string; row: HTMLElement };

/** element の中で選ばれている文字（選択がなければ、または外にあれば空） */
function selectedTextIn(element: Element): string {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return '';
  if (!element.contains(selection.anchorNode)) return '';
  return selection.toString().trim();
}

/**
 * 押した要素から、どのフィルタを確かめるかを決める。名前も本文も IP も使えなければ null（何もしない）
 */
export function resolveFilterRequest(
  chat: Chat,
  row: HTMLElement,
  target: Element | null
): FilterRequest | null {
  const marked = target?.closest(`[${FILTER_TARGET_ATTR}]`) ?? null;
  const kind = marked?.getAttribute(FILTER_TARGET_ATTR);
  if (marked && kind === 'name') {
    const name = marked.getAttribute(FILTER_NAME_ATTR) ?? chat.name;
    if (name.trim() !== '') return { kind: 'name', name, row };
  }
  if (marked && kind === 'message') {
    return { kind: 'word', message: chat.message, selected: selectedTextIn(marked), row };
  }
  return isFilterableIp(chat.ip_masked) ? { kind: 'ip', ip: chat.ip_masked, row } : null;
}
