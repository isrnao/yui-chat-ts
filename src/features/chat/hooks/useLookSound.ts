import { useEffect, useEffectEvent, useState } from 'react';
import type { RoomLogStore } from '@features/chat/api/roomLogStore';
import type { Chat } from '@features/chat/types';
import { isOwnChat } from '@features/chat/utils/ownMessages';
import { filterByIp, type ChatFilterSpec } from '@features/chat/utils/ipFilter';
import {
  playNotificationSound,
  stopNotificationSound,
  isAudioUnlocked,
  unlockAudio,
} from '@features/chat/utils/webAudioPlayer';

/**
 * 発言 `look` / `unlook` で通知音を再生・停止するフック（Issue #184）。
 *
 * Room_Log_Store が Realtime で受けた INSERT（保存された発言）だけを見る。
 * - 取得（fetch）で入った過去の発言では鳴らさない（onInsert は Realtime の INSERT だけを通知する）
 * - 自分の発言の echo では鳴らさない（送り手は保存の完了で自分の音を鳴らす。useChatSession）
 * - フィルタ（伏せ字 IP・名前・言葉）で隠している発言では鳴らさない（ログに出ない人の音だけが鳴り続けないように）
 *
 * 以前は送り手が保存の応答を受けてから broadcast で送っていた。broadcast はクライアントが送るので、
 * 発言を保存しなくても部屋の全員の音を鳴らせた。INSERT から鳴らせば、ログに残った発言でしか鳴らず、
 * 送り手の応答を待たないぶん受け手に届くのも同じか早い。
 */
export function useLookSound(
  store: RoomLogStore,
  filter?: ChatFilterSpec
): {
  isAudioEnabled: boolean;
  enableAudio: () => Promise<void>;
} {
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => isAudioUnlocked());

  // フィルタは変わっても購読し直さない（最新の値を読む）
  const handleInsert = useEffectEvent((chat: Chat) => {
    if (isOwnChat(chat)) return;
    if (filter && filterByIp([chat], filter).visible.length === 0) return;
    const command = chat.message.trim();
    if (command === 'look') {
      // 再生できなくても（音声が許可されていないなど）通知の受信は続ける
      void playNotificationSound().catch(() => {});
    } else if (command === 'unlook') {
      stopNotificationSound();
    }
  });
  useEffect(() => store.onInsert((chat) => handleInsert(chat)), [store]);

  // ユーザーインタラクションで AudioContext を有効化する
  const enableAudio = async () => {
    await unlockAudio();
    setIsAudioEnabled(isAudioUnlocked());
  };

  return { isAudioEnabled, enableAudio };
}
