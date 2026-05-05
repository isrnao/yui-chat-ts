import { useEffect, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { onLookBroadcast } from '@features/chat/api/chatApi';
import {
  playNotificationSound,
  stopNotificationSound,
  isAudioUnlocked,
  unlockAudio,
} from '@features/chat/utils/webAudioPlayer';

/**
 * look/unlook Broadcast 受信で通知音を再生・停止するフック。
 *
 * 音声再生は Supabase Realtime Broadcast 受信時のみ発火する。
 * 過去ログ・Postgres Changes・楽観更新では再生しない。
 *
 * @param _channelRef - 将来の拡張用。現在は chatApi 内部の共有チャネルを使用。
 */
export function useLookSound(_channelRef: React.RefObject<RealtimeChannel | null>): {
  isAudioEnabled: boolean;
  enableAudio: () => Promise<void>;
} {
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => isAudioUnlocked());

  // Broadcast リスナーの登録・解除
  useEffect(() => {
    const unsubscribe = onLookBroadcast((event) => {
      if (event.type === 'look') {
        playNotificationSound();
      } else if (event.type === 'unlook') {
        stopNotificationSound();
      }
    });

    return unsubscribe;
  }, []);

  // ユーザーインタラクションで AudioContext を有効化する
  const enableAudio = useCallback(async () => {
    await unlockAudio();
    setIsAudioEnabled(isAudioUnlocked());
  }, []);

  return { isAudioEnabled, enableAudio };
}
