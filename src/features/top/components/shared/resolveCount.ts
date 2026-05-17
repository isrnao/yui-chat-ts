import type { RoomCountMap } from '../../api/roomCountsApi';
import type { RoomLink } from '../../data';

/** 部屋リンクから表示用のユーザー数を決定する。
 *  `roomId` を持ち Supabase からの値があればその値、それ以外は常に 0。 */
export function resolveCount(item: RoomLink, liveCounts: RoomCountMap): number {
  if (item.roomId && liveCounts[item.roomId] !== undefined) {
    return liveCounts[item.roomId] as number;
  }
  return 0;
}
