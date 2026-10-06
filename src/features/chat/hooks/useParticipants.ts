import { useDeferredValue } from 'react';
import type { Chat, Participant } from '@features/chat/types';
import { readAdminEvent } from '@features/chat/utils/adminMessage';

/**
 * 基準時刻 `now` から見て直近5分以内のメッセージから参加者リストを抽出する。
 * 通常発言に加え、管理人の入室メッセージも参加者として計上し、退室メッセージが後に来た場合は除外する。
 * 誰が入った・出たかは metadata の event / subject（構造）で読み、構造の無い古い行だけ本文で読む（readAdminEvent）。
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
      const admin = readAdminEvent(c);
      if (admin?.event === 'enter') {
        map.set(admin.name, { uuid: c.uuid, name: admin.name, color: admin.color ?? '#333333' });
      } else if (admin?.event === 'exit') {
        map.delete(admin.name);
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
