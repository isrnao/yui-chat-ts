import type { RoomId } from './rooms';

// --- フォントスタイル ---

export type FontSize = 1 | 2 | 3 | 4 | 5;

export const FONT_COLOR_NAMES = [
  'black',
  'gray',
  'silver',
  'white',
  'red',
  'hotpink',
  'orange',
  'gold',
  'yellow',
  'lime',
  'green',
  'aqua',
  'blue',
  'navy',
  'purple',
] as const;

export type FontColorName = (typeof FONT_COLOR_NAMES)[number];

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

export type AvatarId =
  | 'none'
  | 'hoshi1'
  | 'hoshi2'
  | 'hoshi3'
  | 'hoshi4'
  | 'hoshi5'
  | 'hoshi6'
  | 'hoshi7'
  | 'hoshi8'
  | 'miko1'
  | 'tuki1'
  | 'tuki2'
  | 'tuki3'
  | 'tuki4';

export const AVATAR_IDS: readonly AvatarId[] = [
  'none',
  'hoshi1',
  'hoshi2',
  'hoshi3',
  'hoshi4',
  'hoshi5',
  'hoshi6',
  'hoshi7',
  'hoshi8',
  'miko1',
  'tuki1',
  'tuki2',
  'tuki3',
  'tuki4',
] as const;

// --- チャットメタデータ ---

export type ChatMetadata = {
  version: 1;
  fontStyle?: FontStyleMetadata;
  avatar?: Exclude<AvatarId, 'none'>;
  kind?: 'normal' | 'fortune' | 'admin';
  /** 管理人メッセージ用: 対象ユーザーの色（レガシーの orangered 等を再現） */
  userColor?: string;
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
  ip: string;
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
