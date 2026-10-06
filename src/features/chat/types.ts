import type { RoomId } from './rooms';
import {
  AVATAR_IDS as SCHEMA_AVATAR_IDS,
  FONT_COLOR_NAMES,
  type AvatarId as SchemaAvatarId,
  type FontColorName as SchemaFontColorName,
  type FontSize as SchemaFontSize,
  type MetadataKind,
} from './inputRules';

// --- フォントスタイル ---
// 値の一覧は save-chat の許可リスト（schema.ts）が正。サーバーはこれ以外の値を保存しない

export type FontSize = SchemaFontSize;

export { FONT_COLOR_NAMES };

export type FontColorName = SchemaFontColorName;

export const FONT_COLOR_CSS: Record<FontColorName, string> = {
  black: '#000000',
  gray: '#808080',
  silver: '#c0c0c0',
  white: '#ffffff',
  red: '#ff0000',
  hotpink: '#ff69b4',
  orange: '#ff8c00',
  gold: '#ffd700',
  yellow: '#ffff00',
  lime: '#00ff00',
  green: '#008000',
  aqua: '#00ffff',
  blue: '#0000ff',
  navy: '#000080',
  purple: '#800080',
};

export const FONT_SIZE_CSS: Record<FontSize, string> = {
  1: '0.8em',
  2: '1em',
  3: '1.2em',
  4: '1.5em',
  5: '2em',
};

export type FontStyleMetadata = {
  fontSize?: FontSize;
  fontColor?: FontColorName;
  bold?: boolean;
};

// --- アバター（キャラアイコン）---

export type AvatarId = SchemaAvatarId;

export const AVATAR_IDS: readonly AvatarId[] = SCHEMA_AVATAR_IDS;

// --- チャットメタデータ ---

export type ChatMetadata = {
  version: 1;
  fontStyle?: FontStyleMetadata;
  avatar?: Exclude<AvatarId, 'none'>;
  kind?: MetadataKind;
  /** 管理人メッセージ用: 対象ユーザーの色（レガシーの orangered 等を再現） */
  userColor?: string;
  /** 入室メッセージ用: そのユーザーの訪問回数（レガシーの "49回目" 表示） */
  visitCount?: number;
  /** 入室メッセージ用: 前回ログイン時刻 Unix ms（レガシーの "LAST LOGIN:" 表示） */
  lastLogin?: number;
  /**
   * 楽観的更新の重複表示防止用 nonce。
   * `createOptimisticChat` が生成し、保存時にサーバーへ送られ、realtime INSERT で
   * echo されて返るため、temp UUID と savedChat の同一性判定の強い鍵として使える。
   */
  optimisticNonce?: string;
};

// --- チャットメッセージ ---

export type Chat = {
  uuid: string; // UUID v7 (サーバー側で生成される主キー)
  room_id?: RoomId; // 部屋ごとのログ分離。旧データとの互換のため optional
  name: string;
  color: string;
  message: string;
  time: number; // Unix timestamp (milliseconds) - サーバー側で設定
  client_time?: number; // クライアント側の投稿時刻（楽観的更新用）
  optimistic?: boolean; // 楽観的更新フラグ（送信中のメッセージ）
  system?: boolean; // 既存互換として維持（metadata.kind とは別）
  email?: string;
  /** マスク済み IP（表示用）。生 IP はサーバー側のみ保持し anon からは読めない */
  ip_masked: string;
  ua: string;
  metadata?: ChatMetadata;
};

export type Participant = {
  uuid: string;
  name: string;
  color: string;
};

export type BroadcastMsg =
  | { type: 'chat'; chat: Chat }
  | { type: 'join'; user: Participant }
  | { type: 'leave'; user: Participant }
  | { type: 'req-presence' }
  | { type: 'clear' };
