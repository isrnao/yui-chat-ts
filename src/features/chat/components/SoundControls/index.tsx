import { useState, useSyncExternalStore } from 'react';
import {
  isAudioMuted,
  isAudioUnlocked,
  setAudioMuted,
  subscribeAudio,
  unlockAudio,
} from '@features/chat/utils/webAudioPlayer';
export default function SoundControls() {
  const enabled = useSyncExternalStore(subscribeAudio, isAudioUnlocked, () => false);
  const muted = useSyncExternalStore(subscribeAudio, isAudioMuted, () => false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="text-xs inline-flex flex-wrap gap-2 items-center">
      <button
        type="button"
        disabled={enabled}
        onClick={() => {
          // このイベント内でAudioContextを作成/resumeし、user activationを保つ。
          void unlockAudio().then(
            () => setFailed(!isAudioUnlocked()),
            () => setFailed(true)
          );
        }}
      >
        {enabled ? '通知音の再生が可能です' : '通知音を有効にする'}
      </button>
      <label>
        <input
          type="checkbox"
          checked={muted}
          onChange={(event) => setAudioMuted(event.target.checked)}
        />
        通知音をミュート
      </label>
      {failed && <span role="status">音声を有効にできませんでした。もう一度お試しください。</span>}
    </span>
  );
}
