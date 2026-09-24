import { createPersistentStore } from '@shared/utils/persistentStore';
import {
  isSex,
  NAME_MAX,
  PROFILE_MAX,
  type Sex,
} from '../../../../supabase/functions/two-shot/rules.ts';

/**
 * 入室フォームの保存値（原作の cookie の「保存」）。通常のチャットやちゃなりとは別のキーにする。
 * spec: requirements.md Requirement 13
 */
export type SavedEntry = { name: string; sex: Sex; profile: string };

export const entryStore = createPersistentStore<SavedEntry | null>({
  key: 'okiraku:two-shot:entry',
  defaults: null,
  parse: (value) => {
    if (typeof value !== 'object' || value === null) return null;
    const { name, sex, profile } = value as Record<string, unknown>;
    if (typeof name !== 'string' || !isSex(sex) || typeof profile !== 'string') return null;
    return { name: name.slice(0, NAME_MAX), sex, profile: profile.slice(0, PROFILE_MAX) };
  },
});
