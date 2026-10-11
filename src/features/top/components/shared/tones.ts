import type { ChatDirectoryGroup, PickupGroup } from '../../data';

export const toneClass: Record<ChatDirectoryGroup['tone'] | PickupGroup['tone'], string> = {
  pink: 'text-pink-500',
  orange: 'text-orange-500',
  green: 'text-green-500',
  blue: 'text-sky-500',
  purple: 'text-fuchsia-500',
  gray: 'text-gray-500',
};

export const toneMarkerClass: Record<ChatDirectoryGroup['tone'] | PickupGroup['tone'], string> = {
  pink: 'marker:text-pink-500',
  orange: 'marker:text-orange-500',
  green: 'marker:text-green-500',
  blue: 'marker:text-sky-500',
  purple: 'marker:text-fuchsia-500',
  gray: 'marker:text-gray-500',
};

/** 人数のバッジの色。0 人は灰色、4 人以上は橙、それ以外は緑（Android 版も同じ。contracts の home.json） */
export const COUNT_BADGE_TONES = {
  none: 'text-gray-400',
  few: 'text-emerald-500',
  many: 'text-orange-500',
} as const;
/** 何人から「多い」色にするか */
export const COUNT_BADGE_MANY = 4;

export function countBadgeClass(count: number): string {
  if (count === 0) return COUNT_BADGE_TONES.none;
  return count >= COUNT_BADGE_MANY ? COUNT_BADGE_TONES.many : COUNT_BADGE_TONES.few;
}
