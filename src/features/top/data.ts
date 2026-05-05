import { buildChatRoomPath } from '@features/chat/routing';

export type Count = number | string | null;

export type ChatDirectoryGroup = {
  title: string;
  note: string;
  tone: 'pink' | 'orange' | 'green' | 'blue' | 'purple' | 'gray';
  items: Array<{ label: string; count: Count; href: string }>;
};

export type PickupGroup = {
  title: string;
  note: string;
  tone: 'pink' | 'orange' | 'green' | 'blue';
  items: Array<{ label: string; count: Count; href: string }>;
};

export const guideLinks = [
  'チャットのFAQ・よくある質問',
  'チャットの使い方',
  'チャットのルール・マナー',
  'プロフィール作成',
  'コンタクト',
];

export const primaryNav = [
  'チャット',
  'ランキング',
  'プロフィール',
  '動画',
  '荒らし対策',
  'モバイルチャット',
  'リンク集',
  'オフ会',
  '管理人より',
];

export const tabNav = [
  { label: 'チャット', href: '/' },
  { label: '中学生チャット', href: '#pickup-junior-high' },
  { label: '小学生チャット', href: '#pickup-elementary' },
  { label: '高校生チャット', href: '#pickup-high-school' },
  { label: '大学生チャット', href: '#pickup-college' },
  { label: '社会人チャット', href: '#pickup-worker' },
  { label: 'なりきりチャット', href: '#pickup-narikiri' },
];

const placeholderHref = '#';

export const chatDirectoryGroups: ChatDirectoryGroup[] = [
  {
    title: '初心者チャット',
    note: '常連さんはやさしくしてね',
    tone: 'pink',
    items: [
      { label: '超初心者チャット', count: 1, href: buildChatRoomPath('superbeginner') },
      { label: '初めましてチャット', count: 0, href: placeholderHref },
      { label: 'みんなのチャット', count: 9, href: placeholderHref },
      { label: '夢と希望のチャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: '学生チャット',
    note: '学生同士で楽しくチャット',
    tone: 'orange',
    items: [
      { label: '小学生チャット', count: 1, href: placeholderHref },
      { label: '中学生チャット', count: 0, href: placeholderHref },
      { label: '中学生チャット３', count: 0, href: placeholderHref },
      { label: '高校生チャット', count: 0, href: placeholderHref },
      { label: '大学生チャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: '年代別チャット',
    note: '年が近いと話しやすいよね',
    tone: 'orange',
    items: [
      { label: '１０代チャット', count: 0, href: placeholderHref },
      { label: '２０代チャット', count: 0, href: placeholderHref },
      { label: '３０代チャット', count: 1, href: placeholderHref },
    ],
  },
  {
    title: '日常生活のチャット',
    note: 'またーり＆もふもふ',
    tone: 'green',
    items: [
      { label: '旨い店チャット', count: 0, href: placeholderHref },
      { label: 'お洒落チャット', count: 0, href: placeholderHref },
      { label: 'ニュースチャット', count: 0, href: placeholderHref },
      { label: '人生相談チャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: 'アニメチャット',
    note: 'アニメキャラなりきり',
    tone: 'green',
    items: [
      { label: 'アニメチャット', count: 0, href: placeholderHref },
      { label: 'リボーンチャット', count: 0, href: placeholderHref },
      { label: 'モンスターハンターチャット', count: 1, href: placeholderHref },
      { label: '銀魂チャット', count: 0, href: placeholderHref },
      { label: 'ローゼンメイデンチャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: 'ゲームチャット',
    note: 'ゲーマー同士で語ろう',
    tone: 'blue',
    items: [
      { label: 'ゲームチャット', count: 0, href: placeholderHref },
      { label: 'パズドラチャット', count: 0, href: placeholderHref },
      { label: '3DSチャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: '季節のチャット',
    note: '季節イベントのチャット',
    tone: 'pink',
    items: [
      { label: '夏休みチャット', count: 0, href: placeholderHref },
      { label: '花火大会チャット', count: 0, href: placeholderHref },
      { label: '春休みチャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: '地域のチャット',
    note: 'ご近所さんを探そう',
    tone: 'blue',
    items: [
      { label: '関東チャット', count: 0, href: placeholderHref },
      { label: '北海道・東北チャット', count: 0, href: placeholderHref },
      { label: '東海チャット', count: 0, href: placeholderHref },
      { label: '関西チャット', count: 1, href: placeholderHref },
      { label: '中・四国チャット', count: 0, href: placeholderHref },
      { label: '九州・沖縄チャット', count: 0, href: placeholderHref },
    ],
  },
  {
    title: '趣味のチャット',
    note: '気の合う仲間を見つけよう',
    tone: 'blue',
    items: [
      { label: '音楽チャット', count: 1, href: placeholderHref },
      { label: 'ダンスチャット', count: 1, href: placeholderHref },
      { label: '旅行チャット', count: 0, href: placeholderHref },
      { label: 'ダーツチャット', count: 1, href: placeholderHref },
      { label: '卓球チャット', count: 1, href: placeholderHref },
    ],
  },
  {
    title: 'メルヘンチャット[モニタ]',
    note: 'メルヘン＆特殊チャット',
    tone: 'green',
    items: [
      { label: 'おみくじチャット', count: 0, href: placeholderHref },
      { label: 'カオスチャット', count: 0, href: placeholderHref },
      { label: 'プチチャット', count: 1, href: placeholderHref },
      { label: 'ギャルチャット', count: 0, href: placeholderHref },
      { label: 'メルヘンチャット１', count: null, href: placeholderHref },
      { label: 'メルヘンチャット２', count: null, href: placeholderHref },
      { label: '元祖カラフルチャット', count: null, href: placeholderHref },
      { label: 'ホッシーと秘密の部屋', count: null, href: placeholderHref },
    ],
  },
  {
    title: 'オフ会ルーム',
    note: '関東の20代大集合！',
    tone: 'purple',
    items: [
      { label: 'カラオケ', count: null, href: placeholderHref },
      { label: 'カラオケ２', count: null, href: placeholderHref },
      { label: 'スポーツ', count: null, href: placeholderHref },
      { label: '星ぞら', count: null, href: placeholderHref },
      { label: 'お昼寝', count: null, href: placeholderHref },
      { label: '牡蠣フライ', count: null, href: placeholderHref },
    ],
  },
  {
    title: '歴史的チャット',
    note: 'チャット開拓の歴史的場所',
    tone: 'gray',
    items: [
      { label: 'VIPチャット', count: 0, href: placeholderHref },
      { label: '初めてチャット', count: 1, href: placeholderHref },
      { label: 'まったりチャット', count: 0, href: placeholderHref },
      { label: 'わいわいチャット', count: 0, href: placeholderHref },
      { label: '常連チャット', count: 0, href: placeholderHref },
      { label: '小・中学生チャット', count: 0, href: placeholderHref },
      { label: '元祖２０代チャット', count: 0, href: placeholderHref },
      { label: '３０代以上チャット', count: 0, href: placeholderHref },
      { label: 'バトルチャット', count: null, href: placeholderHref },
      { label: '２ショットチャット', count: null, href: placeholderHref },
    ],
  },
];

export const latestLogins = [
  '中学生チャットで友達探し01にかつひろさんが入室しました。',
  '東日本の大学生チャットにいなおさんが入室しました。',
  '高校生チャットで友達探し02にタマ(。^ω^。)さんが入室しました。',
];

export const pickupGroups: PickupGroup[] = [
  {
    title: '中学生チャット',
    note: '全国の中学生集まれ〜！',
    tone: 'pink',
    items: [
      '楽しい中学生チャット02',
      '空気読めない中学生チャット',
      '恋に恋する中学生チャット01',
      '中学生チャット友達探し02',
    ].map((label) => ({
      label,
      count: 0,
      href: placeholderHref,
    })),
  },
  {
    title: '小学生チャット',
    note: '全国の小学生集まれ〜！',
    tone: 'pink',
    items: [
      '小学生チャットいじめ相談室',
      'VIPな小学生チャット02',
      '純情可憐な小学生チャット',
      '都会の小学生チャット',
    ].map((label) => ({
      label,
      count: 0,
      href: placeholderHref,
    })),
  },
  {
    title: '高校生チャット',
    note: '全国の高校生集まれ〜！',
    tone: 'pink',
    items: [
      '目指せ美人！高校生チャット',
      '服について話そ高校生チャット',
      '空気読めない高校生チャット',
      '友達作ろう高校生チャット01',
    ].map((label) => ({
      label,
      count: 0,
      href: placeholderHref,
    })),
  },
  {
    title: 'なりきりチャット',
    note: '好きなキャラになりきろう',
    tone: 'orange',
    items: [
      '銀魂なりきりチャット',
      'ボカロチャット',
      '黒子のバスケチャット',
      'オリキャラなりきりチャット',
      'ヘタリア チャット',
      'デュラララ チャット',
      'イナGOチャット',
      'フェアリーテイルチャット',
      '黒執事なりきりチャット',
      'BASARAチャット',
      '薄桜鬼チャット',
      'リボーンチャット',
      'スケットダンスチャット',
      'NARUTO-ナルト-チャット',
      'うたプリチャット',
      'Ibなりきりチャット',
      'BLEACHチャット',
      '青の祓魔師チャット',
      '東方チャット',
    ].map((label, index) => ({ label, count: index === 2 ? 6 : 0, href: placeholderHref })),
  },
  {
    title: '大学生チャット',
    note: '全国の大学生集まれ〜！',
    tone: 'green',
    items: [
      '大学生チャットで友達作り02',
      '大学生チャット進路相談室',
      '可愛くなれない大学生チャット',
      'ゲーム中毒の大学生チャット',
    ].map((label) => ({
      label,
      count: 0,
      href: placeholderHref,
    })),
  },
  {
    title: '社会人チャット',
    note: '社会人も楽しくチャットしよ！',
    tone: 'blue',
    items: [
      '社会人チャットで友達作り01',
      '予備スペース',
      '純粋乙女な社会人チャット',
      '関西の社会人チャット',
    ].map((label) => ({
      label,
      count: 0,
      href: placeholderHref,
    })),
  },
];

export const profiles = [
  ['おなまえ', 'hoshi1'],
  ['霊灰石', 'tuki1'],
  ['れお', 'hoshi2'],
  ['まーた', 'hoshi3'],
  ['三日月猫', 'hoshi4'],
  ['ゴン', 'tuki2'],
  ['Ghost', 'hoshi5'],
  ['ずんだmochi', 'miko1'],
  ['彩乃', 'hoshi6'],
  ['綾', 'tuki3'],
  ['おなまえ', 'hoshi7'],
  ['†白雪王子†', 'tuki4'],
  ['---', 'hoshi8'],
  ['こころ', 'hoshi1'],
  ['みぅ', 'tuki1'],
  ['おなまえ', 'hoshi2'],
] as const;
