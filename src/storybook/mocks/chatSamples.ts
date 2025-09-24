import type { Chat, Participant } from '@features/chat/types';

const baseTime = Date.parse('2024-01-01T12:00:00Z');

export const sampleParticipants: Participant[] = [
  { uuid: 'participant-1', name: 'ゆい', color: '#ec4899' },
  { uuid: 'participant-2', name: 'たろう', color: '#2563eb' },
  { uuid: 'participant-3', name: 'みどり', color: '#16a34a' },
];

export const sampleChatLog: Chat[] = [
  {
    uuid: 'chat-1',
    name: 'ゆい',
    color: '#ec4899',
    message: 'こんにちは！チャットへようこそ✨',
    time: baseTime,
    client_time: baseTime,
    optimistic: false,
    system: false,
    email: 'yui@example.com',
    ip: '127.0.0.1',
    ua: 'Storybook',
  },
  {
    uuid: 'chat-2',
    name: 'システム',
    color: '#2563eb',
    message: 'サーバーとの接続は良好です。',
    time: baseTime - 60_000,
    client_time: baseTime - 60_000,
    optimistic: false,
    system: true,
    email: '',
    ip: '127.0.0.1',
    ua: 'Storybook',
  },
  {
    uuid: 'chat-3',
    name: 'みどり',
    color: '#16a34a',
    message: '午後のミーティングはどうでしたか？',
    time: baseTime - 120_000,
    client_time: baseTime - 120_000,
    optimistic: false,
    system: false,
    email: '',
    ip: '127.0.0.1',
    ua: 'Storybook',
  },
  {
    uuid: 'chat-4',
    name: 'たろう',
    color: '#2563eb',
    message: 'もうすぐ新しいリリースですね。',
    time: baseTime - 180_000,
    client_time: baseTime - 180_000,
    optimistic: true,
    system: false,
    email: '',
    ip: '127.0.0.1',
    ua: 'Storybook',
  },
];

export const optimisticChat: Chat = {
  uuid: 'chat-optimistic',
  name: 'あなた',
  color: '#f97316',
  message: '送信中のメッセージです...',
  time: baseTime + 30_000,
  client_time: baseTime + 30_000,
  optimistic: true,
  system: false,
  email: '',
  ip: '127.0.0.1',
  ua: 'Storybook',
};

export const sampleWindowRows = 50;
