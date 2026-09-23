import {
  IDLE_SECONDS,
  MAX_LINES,
  ROOM_IDS,
  SEX_LABELS,
  type Sex,
  type TwoShotRoomId,
} from '../../../supabase/functions/two-shot/rules.ts';

/**
 * 原作の「初期設定」に当たる定数（Two_Shot_Config）。値は research.md §4（v5.0.1 の既定）。
 * サーバーが守る数値（行数・時間・部屋の ID・性別の表記）は rules.ts を唯一の定義にし、ここから読む。
 * spec: .kiro/specs/two-shot-chat/design.md §3
 */

const FULL_WIDTH_DIGITS = '０１２３４５６７８９';

/** 「ルーム１」〜「ルーム１０」（原作の部屋名は全角の数字） */
function roomName(id: TwoShotRoomId): string {
  const digits = String(Number(id))
    .split('')
    .map((d) => FULL_WIDTH_DIGITS[Number(d)])
    .join('');
  return `ルーム${digits}`;
}

export const TWO_SHOT_CONFIG = {
  title: 'ツーショットチャット',
  homeLabel: 'ホームページへ戻る',
  sexName: '性別',
  sexLabels: SEX_LABELS,
  colors: {
    headerText: '#FFFFFF',
    headerBackground: '#000000',
    own: '#888888',
    sex: { M: '#5555ff', F: '#ff0000', '-': '#555555' } satisfies Record<Sex, string>,
    status: { empty: '#8888ff', waiting: '#cc6633', full: '#ff0000' },
  },
  rooms: ROOM_IDS.map((id) => ({ id, name: roomName(id) })),
  frames: { lobby: 30, room: 20 },
  lobbyReloadSeconds: 60,
  chatReloadOptions: [0, 20, 30] as const,
  maxLines: MAX_LINES,
  idleSeconds: IDLE_SECONDS,
} as const;

export type AutoSeconds = (typeof TWO_SHOT_CONFIG.chatReloadOptions)[number];

export function getTwoShotRoomName(id: string): string {
  return TWO_SHOT_CONFIG.rooms.find((room) => room.id === id)?.name ?? id;
}
