export type Chat = {
  id: string;
  name: string;
  color: string;
  message: string;
  time: number;
  system?: boolean;
  email?: string;
  ip: string;
  ua: string;
  sending?: boolean;
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
