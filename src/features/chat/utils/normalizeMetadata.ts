import type {
  Chat,
  ChatMetadata,
  FontSize,
  FontColorName,
  FontStyleMetadata,
  AvatarId,
} from '../types';
import { FONT_COLOR_NAMES, AVATAR_IDS } from '../types';

// --- 型ガード関数 ---

const FONT_SIZES = new Set<number>([1, 2, 3, 4, 5]);
const COLOR_SET = new Set<string>(FONT_COLOR_NAMES);
const AVATAR_SET = new Set<string>(AVATAR_IDS);

export function isFontSize(value: unknown): value is FontSize {
  return typeof value === 'number' && FONT_SIZES.has(value);
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

    if (input.kind === 'normal' || input.kind === 'fortune' || input.kind === 'admin') {
      result.kind = input.kind;
    }

    if (typeof input.userColor === 'string') {
      result.userColor = input.userColor;
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
      ip: '',
      ua: '',
    };
  }

  const chat = row as Record<string, unknown>;

  return {
    uuid: typeof chat.uuid === 'string' ? chat.uuid : '',
    name: typeof chat.name === 'string' ? chat.name : '',
    color: typeof chat.color === 'string' ? chat.color : '',
    message: typeof chat.message === 'string' ? chat.message : '',
    time: typeof chat.time === 'number' ? chat.time : 0,
    ...(typeof chat.client_time === 'number' ? { client_time: chat.client_time } : {}),
    ...(typeof chat.optimistic === 'boolean' ? { optimistic: chat.optimistic } : {}),
    ...(typeof chat.system === 'boolean' ? { system: chat.system } : {}),
    ...(typeof chat.email === 'string' ? { email: chat.email } : {}),
    ip: typeof chat.ip === 'string' ? chat.ip : '',
    ua: typeof chat.ua === 'string' ? chat.ua : '',
    metadata: normalizeChatMetadata(chat.metadata),
  };
}
