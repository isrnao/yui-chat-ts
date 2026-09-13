import { useState, useEffect, useRef } from 'react';

import { loadDraft, saveDraft, type ChanariDraft } from '../utils/draftStore';

type SettingsPartial = Partial<Omit<ChanariDraft, 'version' | 'updatedAt' | 'roomId'>>;

export function useChanariSettings(roomId: string) {
  const [settings, setSettings] = useState<Partial<ChanariDraft>>(() => {
    const draft = loadDraft(roomId);
    return draft ?? {};
  });

  // 最新の settings を updater の外側で読むための控え。
  // state updater は純粋である必要があり (Strict Mode では開発時に 2 回呼ばれる)、
  // localStorage への書き込みを updater 内で行うことはできない。
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // roomId が切り替わったときに別 room の draft を引きずらないよう再 hydrate する。
  // 初回マウント時は useState の initializer で読み込み済みなのでスキップする。
  const previousRoomIdRef = useRef(roomId);
  useEffect(() => {
    if (previousRoomIdRef.current === roomId) return;
    previousRoomIdRef.current = roomId;
    const draft = loadDraft(roomId);
    settingsRef.current = draft ?? {};
    setSettings(draft ?? {});
  }, [roomId]);

  const updateSettings = (partial: SettingsPartial) => {
    // ref を即時更新することで、同一 tick 内の連続呼び出しでも取りこぼさない
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    setSettings(next);
    saveDraft({ roomId, ...next });
  };

  return { settings, updateSettings };
}
