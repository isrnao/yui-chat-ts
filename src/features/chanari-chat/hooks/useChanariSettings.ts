import { useSyncExternalStore } from 'react';

import { draftsStore, saveDraft, type ChanariDraft } from '../utils/draftStore';

type SettingsPartial = Partial<Omit<ChanariDraft, 'version' | 'updatedAt' | 'roomId'>>;

const EMPTY: Partial<ChanariDraft> = {};

/**
 * 部屋ごとの下書き（名前・色・最後の発言）。Persistent_Store を useSyncExternalStore で読む。
 *
 * 以前は useState の初期化で localStorage を読み、roomId の変化で読み直す Effect と、
 * 最新の値を ref へ写す Effect を持っていた。ストアから読むので、どちらも不要になった
 * （roomId が変われば読む部屋が変わるだけで、App も key={roomId} で再マウントしている）。
 * SSG / hydration 中は既定値（空）で描画し、その後 localStorage の値に追随する。
 */
export function useChanariSettings(roomId: string) {
  const drafts = useSyncExternalStore(
    draftsStore.subscribe,
    draftsStore.getSnapshot,
    draftsStore.getServerSnapshot
  );
  const settings: Partial<ChanariDraft> = drafts[roomId] ?? EMPTY;

  // 保存はストアの現在値に差分を重ねる（同じ tick 内の連続更新も取りこぼさない）
  const updateSettings = (partial: SettingsPartial) => {
    saveDraft({ roomId, ...partial });
  };

  return { settings, updateSettings };
}
