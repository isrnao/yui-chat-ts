import type { ChatDirectoryGroup, PickupGroup } from '../data';

export const toneClass: Record<ChatDirectoryGroup['tone'] | PickupGroup['tone'], string> = {
  pink: 'text-pink-500',
  orange: 'text-orange-500',
  green: 'text-green-500',
  blue: 'text-sky-500',
  purple: 'text-fuchsia-500',
  gray: 'text-gray-500',
};
