import type { RoomId } from '@features/chat/rooms';

/** 「ログ行数」セレクトの既定の選択肢（レガシーの並び順のまま） */
export const DEFAULT_WINDOW_ROW_OPTIONS = [30, 50, 40, 20, 10, 100] as const;

/** 過去ログをまとめて読みたい部屋向けに、1000 件まで広げた選択肢 */
export const EXTENDED_WINDOW_ROW_OPTIONS = [...DEFAULT_WINDOW_ROW_OPTIONS, 200, 500, 1000] as const;

/** 1000 件まで選べる部屋（管理者チャットと全部屋まとめ） */
const EXTENDED_LOG_ROOM_IDS: ReadonlySet<RoomId> = new Set<RoomId>(['com_sb', 'all']);

export function getWindowRowOptions(roomId: RoomId): readonly number[] {
  return EXTENDED_LOG_ROOM_IDS.has(roomId)
    ? EXTENDED_WINDOW_ROW_OPTIONS
    : DEFAULT_WINDOW_ROW_OPTIONS;
}
