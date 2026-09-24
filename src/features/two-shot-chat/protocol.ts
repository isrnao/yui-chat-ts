import {
  isRoomId,
  isSex,
  type EnterCommand,
  type ErrorCode,
  type RoomView,
  type Sex,
  type ViewLine,
} from '../../../supabase/functions/two-shot/rules.ts';
import type { LobbyRow } from './components/RoomList';

/**
 * Two_Shot_API（Edge Function two-shot）と公開一覧（two_shot_lobby()）の要求・応答の形と検証。
 * spec: .kiro/specs/two-shot-chat/design.md §7
 *
 * 応答はサーバーの handler.ts と同じ形。形が違う応答は「通信の失敗（E12）」として扱い、画面を壊さない。
 * handler の実際の出力から作ったフィクスチャ（supabase/functions/two-shot/fixtures）でこの検証を確かめる。
 */

export type EnterRequest = Omit<EnterCommand, 'op'> & { room: string };

export type TwoShotRequest =
  | ({ op: 'enter' } & EnterRequest)
  | { room: string; op: 'read' | 'clear' | 'leave' | 'kick' | 'close' }
  | { room: string; op: 'say'; text: string };

export type TwoShotResponse =
  | { ok: true; screen: 'room'; room: RoomView }
  | { ok: true; screen: 'lobby' }
  | { ok: false; notice: ErrorCode; placement: 'page' | 'pane' };

const ERROR_CODES: readonly string[] = [
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'E6',
  'E7',
  'E8',
  'E9',
  'E12',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isViewLine(value: unknown): value is ViewLine {
  if (!isObject(value) || !isTime(value.at)) return false;
  if (value.kind === 'message') {
    return (
      typeof value.mine === 'boolean' &&
      typeof value.name === 'string' &&
      typeof value.text === 'string'
    );
  }
  if (value.kind !== 'notice' || !isObject(value.params)) return false;
  const { params } = value;
  switch (value.code) {
    case 'N1':
    case 'N2':
    case 'N3':
      return typeof params.name === 'string' && isSex(params.sex);
    case 'N4':
      return typeof params.name === 'string' && typeof params.profile === 'string';
    case 'N6':
      return typeof params.name === 'string';
    case 'N5':
    case 'N7':
    case 'N8':
    case 'N9':
    case 'N10':
      return true;
    default:
      return false;
  }
}

function isRoomView(value: unknown): value is RoomView {
  return (
    isObject(value) &&
    isRoomId(value.roomId) &&
    (value.seat === 0 || value.seat === 1) &&
    isObject(value.me) &&
    typeof value.me.name === 'string' &&
    isSex(value.me.sex) &&
    Array.isArray(value.lines) &&
    value.lines.length <= 10 &&
    value.lines.every(isViewLine) &&
    typeof value.idleSeconds === 'number' &&
    Number.isInteger(value.idleSeconds) &&
    value.idleSeconds >= 0
  );
}

/** Two_Shot_API の応答を検証する。形が違えば null */
export function parseTwoShotResponse(value: unknown): TwoShotResponse | null {
  if (!isObject(value)) return null;
  if (value.ok === true) {
    if (value.screen === 'lobby') return { ok: true, screen: 'lobby' };
    if (value.screen === 'room' && isRoomView(value.room)) {
      return { ok: true, screen: 'room', room: value.room };
    }
    return null;
  }
  if (
    value.ok === false &&
    typeof value.notice === 'string' &&
    ERROR_CODES.includes(value.notice) &&
    (value.placement === 'page' || value.placement === 'pane')
  ) {
    return { ok: false, notice: value.notice as ErrorCode, placement: value.placement };
  }
  return null;
}

/** two_shot_lobby() の行を検証して、部屋 ID ごとの一覧の行にする。形が違えば null */
export function parseLobbyRows(value: unknown): Record<string, LobbyRow> | null {
  if (!Array.isArray(value)) return null;
  const rows: Record<string, LobbyRow> = {};
  for (const row of value) {
    if (!isObject(row) || !isRoomId(row.room_id)) return null;
    switch (row.status) {
      case 'empty':
      case 'full':
        rows[row.room_id] = { status: row.status };
        break;
      case 'waiting':
        if (!isSex(row.sex) || typeof row.name !== 'string' || typeof row.profile !== 'string') {
          return null;
        }
        rows[row.room_id] = {
          status: 'waiting',
          sex: row.sex as Sex,
          name: row.name,
          profile: row.profile,
        };
        break;
      default:
        return null;
    }
  }
  return rows;
}
