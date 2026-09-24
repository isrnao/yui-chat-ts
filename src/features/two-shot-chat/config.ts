import {
  IDLE_SECONDS,
  MAX_LINES,
  ROOM_IDS,
  SEX_LABELS,
  type Sex,
} from '../../../supabase/functions/two-shot/rules.ts';

/**
 * 画面の定数（Two_Shot_Config）。動きは原作 2SHOT-CHAT v5.0.1 の既定（research.md §4）、見た目と文言は
 * 旧お気楽チャットの待合室（アーカイブの 2shot.php。research.md §8）に合わせる。
 * サーバーが守る数値（行数・時間・部屋の ID・性別の表記）は rules.ts を唯一の定義にし、ここから読む。
 * spec: .kiro/specs/two-shot-chat/design.md §3
 */
export const TWO_SHOT_CONFIG = {
  title: 'ツーショットチャット',
  /** 待合室の上のリンク（旧お気楽チャットの <h1>） */
  siteLabel: 'チャットならお気楽チャット',
  homeLabel: 'チャットならお気楽チャットにもどる',
  nameLabel: 'ハンドルネーム',
  profileLabel: '待機用プロフィール',
  /** 旧お気楽チャットの入力欄の上限（<input name="mes" maxlength=50>）。サーバーの上限（PROFILE_MAX）より短い */
  profileMaxLength: 50,
  sexName: '性別',
  sexLabels: SEX_LABELS,
  colors: {
    own: '#888888',
    sex: { M: '#0099ff', F: '#ff0099', '-': '#555555' } satisfies Record<Sex, string>,
    status: { empty: '#8888ff', waiting: '#00dd00', full: '#ff0000' },
    notice: '#ff0000',
  },
  rooms: ROOM_IDS.map((id) => ({ id, name: `チャットルーム${id}` })),
  /** 待合室は <frameset rows="245,*" border=0>。入室後は原作の 20% で、境界線を動かせる */
  frames: { lobbyTopPx: 245, room: 20 },
  lobbyReloadSeconds: 60,
  chatReloadOptions: [0, 20, 30] as const,
  maxLines: MAX_LINES,
  idleSeconds: IDLE_SECONDS,
} as const;

export type AutoSeconds = (typeof TWO_SHOT_CONFIG.chatReloadOptions)[number];

export function getTwoShotRoomName(id: string): string {
  return TWO_SHOT_CONFIG.rooms.find((room) => room.id === id)?.name ?? id;
}
