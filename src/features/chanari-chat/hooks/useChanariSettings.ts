import { useState, useCallback } from 'react';

import { loadDraft, saveDraft, type ChanariDraft } from '../utils/draftStore';

type SettingsPartial = Partial<Omit<ChanariDraft, 'version' | 'updatedAt' | 'roomId'>>;

export function useChanariSettings(roomId: string) {
  const [settings, setSettings] = useState<Partial<ChanariDraft>>(() => {
    const draft = loadDraft(roomId);
    return draft ?? {};
  });

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
