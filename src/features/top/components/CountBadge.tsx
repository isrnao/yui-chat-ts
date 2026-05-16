import type { RoomCountMap } from '../api/roomCountsApi';
import type { RoomLink } from '../data';

/** 部屋リンクから表示用のユーザー数を決定する。
 *  `roomId` を持ち Supabase からの値があればその値、それ以外は常に 0。 */
export function resolveCount(item: RoomLink, liveCounts: RoomCountMap): number {
  if (item.roomId && liveCounts[item.roomId] !== undefined) {
    return liveCounts[item.roomId] as number;
  }
  return 0;
}

export function CountBadge({ count }: { count: number }) {
  const color = count === 0 ? 'text-gray-400' : count >= 4 ? 'text-orange-500' : 'text-emerald-500';
  return <span className={`ml-1 font-bold ${color}`}>{count}人</span>;
}
