import type { Chat } from '../types';

/**
 * レガシーの管理人メッセージから「ユーザー名」部分を抽出する。
 * 例: "薄ら紅 さん、Welcome to お気楽チャット☆" → { userName: '薄ら紅', rest: 'さん、Welcome to...' }
 * 例: "薄ら紅さん、またきておくれやすぅ。" → { userName: '薄ら紅', rest: 'さん、...' }
 */
export function splitAdminMessage(message: string): { userName: string; rest: string } | null {
  const match = message.match(/^(.+?)\s?(さん[、,].+)$/);
  if (!match) return null;
  return { userName: match[1].trim(), rest: match[2] };
}

const WELCOME_PATTERN = /^(.+?)\sさん、Welcome to/;
const EXIT_PATTERN = /^(.+?)さん、またきておくれやすぅ/;

export interface AdminEventInfo {
  event: 'enter' | 'exit';
  /** 入退室した人の名前 */
  name: string;
  /** 入退室した人の色（分からなければ undefined） */
  color?: string;
  /** 表示用: 本文から名前を除いた残り（「さん、Welcome to…」）。名前で始まらない本文なら本文全体 */
  rest: string;
}

/**
 * 管理人の発言から、誰が入った・出たかを読む（Issue #183）。
 *
 * サーバーが作った行は metadata の event / subject（構造）で読む。本文の文言が変わっても壊れない。
 * 構造の無い古い行だけ、今までどおり本文の正規表現で読む。入退室でない管理人の発言（triage の返信など）は null。
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

  const enter = chat.message.match(WELCOME_PATTERN);
  const exit = enter ? null : chat.message.match(EXIT_PATTERN);
  const match = enter ?? exit;
  if (!match) return null;
  const split = splitAdminMessage(chat.message);
  return {
    event: enter ? 'enter' : 'exit',
    name: match[1].trim(),
    color: chat.metadata.userColor,
    rest: split?.rest ?? chat.message,
  };
}
