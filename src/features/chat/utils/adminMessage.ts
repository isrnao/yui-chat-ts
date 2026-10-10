import type { Chat } from '../types';

export interface AdminEventInfo {
  event: 'enter' | 'exit';
  /** 入退室した人の名前 */
  name: string;
  /** 入退室した人の色（分からなければ undefined） */
  color?: string;
  /** 表示用: 本文から名前を除いた残り（「さん、Welcome to…」）。名前で始まらない本文なら本文全体 */
  rest: string;
}

// 構造の無い古い行の本文: 「{名前} さん、Welcome to …」「{名前}さん、またきておくれやすぅ。」
// 名前の後の空白と読点（、/ ,）の揺れも受ける
const LEGACY_PATTERN = /^(.+?)\s?(さん[、,]\s*(Welcome to|またきておくれやすぅ).*)$/s;

/**
 * 管理人の発言から、誰が入った・出たかを読む（Issue #183）。参加者一覧・ログの表示・フィルタの名前はすべてこれを使う。
 *
 * サーバーが作った行は metadata の event / subject（構造）で読む。本文の文言が変わっても壊れない。
 * 構造の無い古い行だけ、本文で読む。入退室でない管理人の発言（triage の返信など）は null。
 */
export function readAdminEvent(chat: Pick<Chat, 'message' | 'metadata'>): AdminEventInfo | null {
  if (chat.metadata?.kind !== 'admin') return null;
  const { event, subject } = chat.metadata;
  if (event && subject) {
    const rest = chat.message.startsWith(subject.name)
      ? chat.message.slice(subject.name.length).replace(/^\s/, '')
      : chat.message;
    return { event, name: subject.name, color: subject.color || undefined, rest };
  }

  const legacy = chat.message.match(LEGACY_PATTERN);
  if (!legacy) return null;
  return {
    event: legacy[3] === 'Welcome to' ? 'enter' : 'exit',
    name: legacy[1].trim(),
    color: chat.metadata.userColor,
    rest: legacy[2],
  };
}
