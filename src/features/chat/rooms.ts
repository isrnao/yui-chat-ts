export const CHAT_ROOM_IDS = [
  // 初心者チャット
  'superbeginner',
  'hajime',
  'ofall',
  'yume',
  // 学生チャット
  'elementary',
  'juniorhighschool',
  'juniorhighschool3',
  'highschool',
  'daigaku',
  // 年代別チャット
  '10generations',
  '20generations',
  '30generations',
  // 日常生活のチャット
  'umaimise',
  'osare',
  'news',
  'jinsei',
  // アニメチャット
  'anime',
  'reborn',
  'monhan',
  'kintama',
  'rozen',
  // ゲームチャット
  'game',
  'pazudora',
  '3ds',
  // 季節のチャット
  'natsuyasumi',
  'hanabi-taikai',
  'haruyasumi',
  // 地域のチャット
  'area_kantoh',
  'area_hok_touho',
  'area_toukai',
  'area_kansai',
  'area_chu_shi',
  'area_kyu_oki',
  // 趣味のチャット
  'music',
  'dance',
  'travel',
  'darts',
  'tabletennis',
  // メルヘンチャット
  'omikuji',
  'mico',
  'puchi',
  'gyamikuji',
  'meruhen1',
  'meruhen2',
  'colorful',
  'hoshi',
  // オフ会ルーム
  'karaoke',
  'karaoke2',
  'sports',
  'hoshizora',
  'ohirune',
  'kakifry',
  // 歴史的チャット
  'vip',
  'hajime-old',
  'mattari',
  'wai2',
  'joren',
  'shouchu',
  '20dai',
  '30dai',
  'battle',
  '2shot',
] as const;

export type RoomId = (typeof CHAT_ROOM_IDS)[number];

export type RoomMeta = {
  id: RoomId;
  title: string;
  description: string;
  enabled: boolean;
};

export const DEFAULT_ROOM_ID: RoomId = 'superbeginner';

/**
 * 各ルームのタイトル / 紹介文。
 * 左カラムに表示しているラベルと一致させる (ただし「初めてチャット」は `hajime-old` にマップし
 * ラベルもそのまま「初めてチャット」とする)。
 */
const ROOM_TITLES: Record<RoomId, string> = {
  superbeginner: '超初心者チャット',
  hajime: '初めましてチャット',
  ofall: 'みんなのチャット',
  yume: '夢と希望のチャット',

  elementary: '小学生チャット',
  juniorhighschool: '中学生チャット',
  juniorhighschool3: '中学生チャット３',
  highschool: '高校生チャット',
  daigaku: '大学生チャット',

  '10generations': '１０代チャット',
  '20generations': '２０代チャット',
  '30generations': '３０代チャット',

  umaimise: '旨い店チャット',
  osare: 'お洒落チャット',
  news: 'ニュースチャット',
  jinsei: '人生相談チャット',

  anime: 'アニメチャット',
  reborn: 'リボーンチャット',
  monhan: 'モンスターハンターチャット',
  kintama: '銀魂チャット',
  rozen: 'ローゼンメイデンチャット',

  game: 'ゲームチャット',
  pazudora: 'パズドラチャット',
  '3ds': '3DSチャット',

  natsuyasumi: '夏休みチャット',
  'hanabi-taikai': '花火大会チャット',
  haruyasumi: '春休みチャット',

  area_kantoh: '関東チャット',
  area_hok_touho: '北海道・東北チャット',
  area_toukai: '東海チャット',
  area_kansai: '関西チャット',
  area_chu_shi: '中・四国チャット',
  area_kyu_oki: '九州・沖縄チャット',

  music: '音楽チャット',
  dance: 'ダンスチャット',
  travel: '旅行チャット',
  darts: 'ダーツチャット',
  tabletennis: '卓球チャット',

  omikuji: 'おみくじチャット',
  mico: 'カオスチャット',
  puchi: 'プチチャット',
  gyamikuji: 'ギャルチャット',
  meruhen1: 'メルヘンチャット１',
  meruhen2: 'メルヘンチャット２',
  colorful: '元祖カラフルチャット',
  hoshi: 'ホッシーと秘密の部屋',

  karaoke: 'カラオケ',
  karaoke2: 'カラオケ２',
  sports: 'スポーツ',
  hoshizora: '星ぞら',
  ohirune: 'お昼寝',
  kakifry: '牡蠣フライ',

  vip: 'VIPチャット',
  'hajime-old': '初めてチャット',
  mattari: 'まったりチャット',
  wai2: 'わいわいチャット',
  joren: '常連チャット',
  shouchu: '小・中学生チャット',
  '20dai': '元祖２０代チャット',
  '30dai': '３０代以上チャット',
  battle: 'バトルチャット',
  '2shot': '２ショットチャット',
};

function buildRoomMeta(): Record<RoomId, RoomMeta> {
  const entries = CHAT_ROOM_IDS.map((id): [RoomId, RoomMeta] => [
    id,
    {
      id,
      title: ROOM_TITLES[id],
      description: `${ROOM_TITLES[id]} でゆっくりおしゃべりしましょう。`,
      enabled: true,
    },
  ]);
  return Object.fromEntries(entries) as Record<RoomId, RoomMeta>;
}

export const CHAT_ROOMS: Record<RoomId, RoomMeta> = buildRoomMeta();

export function isRoomId(value: string): value is RoomId {
  return value in CHAT_ROOMS;
}

export function isEnabledRoomId(value: string): value is RoomId {
  return isRoomId(value) && CHAT_ROOMS[value].enabled;
}

export function getRoomMeta(roomId: RoomId): RoomMeta {
  return CHAT_ROOMS[roomId];
}
