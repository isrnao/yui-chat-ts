export type Chat = {
  id: string;
  name: string;
  color: string;
  message: string;
  time: number; // Unix timestamp (milliseconds) - サーバー側で設定
  client_time?: number; // クライアント側の投稿時刻（楽観的更新用）
  optimistic?: boolean; // 楽観的更新フラグ（送信中のメッセージ）
  system?: boolean;
  email?: string;
  ip: string;
  ua: string;
};

export type Participant = {
  id: string;
  name: string;
  color: string;
};

export type BroadcastMsg =
  | { type: 'chat'; chat: Chat }
  | { type: 'join'; user: Participant }
  | { type: 'leave'; user: Participant }
  | { type: 'req-presence' }
  | { type: 'clear' };
