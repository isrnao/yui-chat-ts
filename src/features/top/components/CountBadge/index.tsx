import { useContext } from 'react';
import { RoomCountContext } from '../../hooks/roomCountContext';
import { TWO_SHOT_CHAT_ENABLED, type RoomId } from '@features/chat/rooms';
import { countBadgeClass } from '../shared/tones';
export function CountBadge({ count, roomId }: { count: number; roomId?: RoomId }) {
  const source = useContext(RoomCountContext);
  const failed = !!source && (!roomId || source.failedRooms.includes(roomId));
  const known = !source || (!!roomId && source.counts[roomId] !== undefined);
  const value = failed && !known ? null : count;
  const definition =
    TWO_SHOT_CHAT_ENABLED && roomId === '2shot'
      ? '現在席に着いている人数'
      : '直近6時間に公開ログで発言した人数';
  return (
    <span
      data-count-status={failed ? (known ? 'stale' : source?.kind) : 'ready'}
      title={value === null ? '人数は未取得です' : `${definition}${failed ? '（前回取得値）' : ''}`}
      className={`ml-1 font-bold ${value === null ? 'text-gray-500' : countBadgeClass(value)}`}
    >
      {value === null ? '—' : `${value}人`}
    </span>
  );
}
