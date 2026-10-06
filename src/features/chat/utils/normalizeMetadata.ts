import type {
  Chat,
  ChatMetadata,
  FontSize,
  FontColorName,
  FontStyleMetadata,
  AvatarId,
} from '../types';
import { DEFAULT_ROOM_ID, isRoomId } from '../rooms';
import {
  AVATAR_IDS,
  FONT_COLOR_NAMES,
  FONT_SIZES,
  METADATA_KINDS,
  type MetadataKind,
} from '../inputRules';

// --- 型ガード関数 ---
// 一覧は save-chat の許可リスト（schema.ts）と同じものを使う。新しい行はサーバーが作り直して保存するが、
// それより前の行（と Realtime で届く行）のために読む側でも同じ規則で確かめる

const SIZE_SET = new Set<number>(FONT_SIZES);
const COLOR_SET = new Set<string>(FONT_COLOR_NAMES);
const AVATAR_SET = new Set<string>(AVATAR_IDS);
const KIND_SET = new Set<string>(METADATA_KINDS);

export function isFontSize(value: unknown): value is FontSize {
  return typeof value === 'number' && SIZE_SET.has(value);
}

export function isFontColorName(value: unknown): value is FontColorName {
  return typeof value === 'string' && COLOR_SET.has(value);
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && AVATAR_SET.has(value);
}

// --- メタデータ正規化 ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFontStyle(input: unknown): FontStyleMetadata | undefined {
  if (!isRecord(input)) return undefined;

  const result: FontStyleMetadata = {};
  let hasField = false;

  if (isFontSize(input.fontSize)) {
    result.fontSize = input.fontSize;
    hasField = true;
  }
  if (isFontColorName(input.fontColor)) {
    result.fontColor = input.fontColor;
    hasField = true;
  }
  if (typeof input.bold === 'boolean') {
    result.bold = input.bold;
    hasField = true;
  }

  return hasField ? result : undefined;
}

/**
 * DB由来の metadata を正規化する。
 * 不正値はサイレントに除去し、例外をスローしない。
 * version が未対応の場合は undefined にフォールバックする。
 */
export function normalizeChatMetadata(input: unknown): ChatMetadata | undefined {
  try {
    if (!isRecord(input)) return undefined;
    if (input.version !== 1) return undefined;

    const result: ChatMetadata = { version: 1 };

    const fontStyle = normalizeFontStyle(input.fontStyle);
    if (fontStyle) result.fontStyle = fontStyle;

    // 'none' はメタデータに保存しない（Exclude<AvatarId, 'none'>）
    if (isAvatarId(input.avatar) && input.avatar !== 'none') {
      result.avatar = input.avatar;
    }

    if (typeof input.kind === 'string' && KIND_SET.has(input.kind)) {
      result.kind = input.kind as MetadataKind;
    }

    if (typeof input.userColor === 'string') {
      result.userColor = input.userColor;
    }

    if (typeof input.visitCount === 'number' && Number.isFinite(input.visitCount)) {
      result.visitCount = input.visitCount;
    }

    if (typeof input.lastLogin === 'number' && Number.isFinite(input.lastLogin)) {
      result.lastLogin = input.lastLogin;
    }

    if (typeof input.optimisticNonce === 'string') {
      result.optimisticNonce = input.optimisticNonce;
    }

    // 入退室の構造（サーバーが管理人の発言にだけ書く。利用者の発言では save-chat が落とす）
    if (input.event === 'enter' || input.event === 'exit') {
      const subject = input.subject;
      if (isRecord(subject) && typeof subject.name === 'string' && subject.name !== '') {
        result.event = input.event;
        result.subject = {
          name: subject.name,
          color: typeof subject.color === 'string' ? subject.color : '',
        };
      }
    }

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Chat 行全体を正規化するラッパー。
 * API境界（chatApi.ts）で使用し、metadata フィールドを安全に正規化する。
 */
export function normalizeChat(row: unknown): Chat {
  if (!isRecord(row)) {
    // 最低限の安全なデフォルト値を返す
    return {
      uuid: '',
      name: '',
      color: '',
      message: '',
      time: 0,
      ip_masked: '',
      ua: '',
    };
  }

  const chat = row as Record<string, unknown>;

  return {
    uuid: typeof chat.uuid === 'string' ? chat.uuid : '',
    room_id:
      typeof chat.room_id === 'string' && isRoomId(chat.room_id) ? chat.room_id : DEFAULT_ROOM_ID,
    name: typeof chat.name === 'string' ? chat.name : '',
    color: typeof chat.color === 'string' ? chat.color : '',
    message: typeof chat.message === 'string' ? chat.message : '',
    time: typeof chat.time === 'number' ? chat.time : 0,
    ...(typeof chat.client_time === 'number' ? { client_time: chat.client_time } : {}),
    ...(typeof chat.optimistic === 'boolean' ? { optimistic: chat.optimistic } : {}),
    ...(typeof chat.system === 'boolean' ? { system: chat.system } : {}),
    ...(typeof chat.email === 'string' ? { email: chat.email } : {}),
    ip_masked: typeof chat.ip_masked === 'string' ? chat.ip_masked : '',
    ua: typeof chat.ua === 'string' ? chat.ua : '',
    metadata: normalizeChatMetadata(chat.metadata),
  };
}
