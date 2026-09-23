import { useDeferredValue } from 'react';
import type { Chat, Participant } from '@features/chat/types';

const WELCOME_PATTERN = /^(.+?)\sさん、Welcome to/;
const EXIT_PATTERN = /^(.+?)さん、またきておくれやすぅ/;

/**
 * 基準時刻 `now` から見て直近5分以内のメッセージから参加者リストを抽出する。
 * 通常発言に加え、管理人の入室メッセージ（"{name} さん、Welcome to..."）も参加者として計上する。
 * 退室メッセージ（"{name}さん、またきておくれやすぅ"）が後に来た場合は除外する。
 *
 * 時刻は引数で受け取る純粋関数にしている。関数の中で Date.now() を呼ぶと、React Compiler の
 * メモ化で結果が chatLog の変化まで固定され、発言がないと 5 分を過ぎた人が残り続けていた。
 */
export function getRecentParticipants(chatLog: Chat[], now: number): Participant[] {
  const WINDOW_MS = 5 * 60 * 1000;

  // 時刻順にマップへ追加・削除していく
  const map = new Map<string, Participant>();

  // 時刻昇順にソートして処理（古い順→新しい順）
  const recentChats = chatLog
    .filter((c) => now - c.time <= WINDOW_MS)
    .slice()
    .sort((a, b) => a.time - b.time);

  for (const c of recentChats) {
    if (c.metadata?.kind === 'admin') {
      // 管理人の入室メッセージから参加者を抽出
      const enterMatch = c.message.match(WELCOME_PATTERN);
      if (enterMatch) {
        const name = enterMatch[1].trim();
        const color = c.metadata.userColor ?? '#333333';
        map.set(name, { uuid: c.uuid, name, color });
        continue;
      }
      // 退室メッセージなら参加者から除外
      const exitMatch = c.message.match(EXIT_PATTERN);
      if (exitMatch) {
        const name = exitMatch[1].trim();
        map.delete(name);
        continue;
      }
    } else if (c.name && c.color && !c.system) {
      // 通常発言: 発言者を参加者として登録
      map.set(c.name, { uuid: c.uuid, name: c.name, color: c.color });
    }
  }

  return Array.from(map.values());
}

/**
 * @param now 基準時刻。useNowMinute() の値を渡すと、分の境界ごとに窓から外れた人が除かれる
 */
// メモ化は React Compiler に任せる（手動の useMemo は不要）
export function useParticipants(chatLog: Chat[], now: number) {
  const deferredChatLog = useDeferredValue(chatLog);
  return getRecentParticipants(deferredChatLog, now);
}
