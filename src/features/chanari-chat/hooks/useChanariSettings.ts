import { useState, useCallback, useEffect, useRef } from 'react';

import { loadDraft, saveDraft, type ChanariDraft } from '../utils/draftStore';

type SettingsPartial = Partial<Omit<ChanariDraft, 'version' | 'updatedAt' | 'roomId'>>;

export function useChanariSettings(roomId: string) {
  const [settings, setSettings] = useState<Partial<ChanariDraft>>(() => {
    const draft = loadDraft(roomId);
    return draft ?? {};
  });

  // roomId が切り替わったときに別 room の draft を引きずらないよう再 hydrate する。
  // 初回マウント時は useState の initializer で読み込み済みなのでスキップする。
  const previousRoomIdRef = useRef(roomId);
  useEffect(() => {
    if (previousRoomIdRef.current === roomId) return;
    previousRoomIdRef.current = roomId;
    const draft = loadDraft(roomId);
    setSettings(draft ?? {});
  }, [roomId]);

  const updateSettings = useCallback(
    (partial: SettingsPartial) => {
      setSettings((prev) => {
        const next = { ...prev, ...partial };
        saveDraft({ roomId, ...next });
        return next;
      });
    },
    [roomId]
  );

  return { settings, updateSettings };
}
