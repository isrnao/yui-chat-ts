import { buildChatRoomPath } from '@features/chat/routing';
import { buildChanariRoomPath } from '@features/chanari-chat/routing';
import type { RoomId } from '@features/chat/rooms';

export type RoomLink = {
  label: string;
  href: string;
  /** 内部ルームの場合のみ設定される。外部リンクや未対応部屋では undefined */
  roomId?: RoomId;
  /** true (または未指定の外部URL) のとき target="_blank" rel="noopener noreferrer" を付与する */
  external?: boolean;
};

export type ChatDirectoryGroup = {
  title: string;
  note: string;
  tone: 'pink' | 'orange' | 'green' | 'blue' | 'purple' | 'gray';
  items: RoomLink[];
};

export type PickupGroup = {
  title: string;
  note: string;
  tone: 'pink' | 'orange' | 'green' | 'blue';
  items: RoomLink[];
  moreHref?: string;
};

export const guideLinks = [
  'チャットのFAQ・よくある質問',
  'チャットの使い方',
  'チャットのルール・マナー',
  'プロフィール作成',
  'コンタクト',
];

/**
 * ガイドメニュー項目のアイコン種別。`guideLinks` とインデックス対応する。
 * 判別ユニオンにより、`GuideIcon` コンポーネントの switch 分岐で網羅性チェックを効かせる。
 */
export type GuideIconKind = 'faq' | 'tutorial' | 'heart' | 'profile' | 'mail';

/**
 * `guideLinks` と同じ順序・同じ長さのアイコン種別配列。
 * 両者を zip して `GuideMenu` に渡す。
 */
export const guideIcons: readonly GuideIconKind[] = [
  'faq', // チャットのFAQ・よくある質問
  'tutorial', // チャットの使い方
  'heart', // チャットのルール・マナー
  'profile', // プロフィール作成
  'mail', // コンタクト
] as const;

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
  { label: 'チャット', href: import.meta.env.BASE_URL },
  { label: '中学生チャット', href: '#pickup-junior-high' },
  { label: '小学生チャット', href: '#pickup-elementary' },
  { label: '高校生チャット', href: '#pickup-high-school' },
  { label: '大学生チャット', href: '#pickup-college' },
  { label: '社会人チャット', href: '#pickup-worker' },
  { label: 'なりきりチャット', href: '#pickup-narikiri' },
];

/**
 * 内部ルーム (`/yui-chat-ts/chat/<roomId>`) へのリンクを生成する。
 * 参加者数はランタイムに `useRoomCounts` 経由で Supabase から取得され、
 * 取得できない場合は表示側で 0 にフォールバックされる。
 */
function room(label: string, roomId: RoomId): RoomLink {
  return { label, href: buildChatRoomPath(roomId), roomId, external: false };
}

/**
 * chanari UI (`/yui-chat-ts/chanari/<roomId>`) へのリンクを生成する。
 * なりきりチャット系のルームで使用する。
 */
function chanariRoom(label: string, roomId: RoomId): RoomLink {
  return { label, href: buildChanariRoomPath(roomId), roomId, external: false };
}

export const chatDirectoryGroups: ChatDirectoryGroup[] = [
  {
    title: '初心者チャット',
    note: '常連さんはやさしくしてね',
    tone: 'pink',
    items: [
      room('超初心者チャット', 'superbeginner'),
      room('初めましてチャット', 'hajime'),
      room('みんなのチャット', 'ofall'),
      room('夢と希望のチャット', 'yume'),
    ],
  },
  {
    title: '学生チャット',
    note: '学生同士で楽しくチャット',
    tone: 'orange',
    items: [
      room('小学生チャット', 'elementary'),
      room('中学生チャット', 'juniorhighschool'),
      room('中学生チャット３', 'juniorhighschool3'),
      room('高校生チャット', 'highschool'),
      room('大学生チャット', 'daigaku'),
    ],
  },
  {
    title: '年代別チャット',
    note: '年が近いと話しやすいよね',
    tone: 'orange',
    items: [
      room('１０代チャット', '10generations'),
      room('２０代チャット', '20generations'),
      room('３０代チャット', '30generations'),
    ],
  },
  {
    title: '日常生活のチャット',
    note: 'またーり＆もふもふ',
    tone: 'green',
    items: [
      room('旨い店チャット', 'umaimise'),
      room('お洒落チャット', 'osare'),
      room('ニュースチャット', 'news'),
      room('人生相談チャット', 'jinsei'),
    ],
  },
  {
    title: 'アニメチャット',
    note: 'アニメキャラなりきり',
    tone: 'green',
    items: [
      chanariRoom('アニメチャット', 'anime'),
      chanariRoom('リボーンチャット', 'reborn'),
      chanariRoom('モンスターハンターチャット', 'monhan'),
      // 通常チャットとして /chat/gintama に遷移する (なりきりは pickup 側で別途扱う)
      room('銀魂チャット', 'gintama'),
      chanariRoom('ローゼンメイデンチャット', 'rozen'),
    ],
  },
  {
    title: 'ゲームチャット',
    note: 'ゲーマー同士で語ろう',
    tone: 'blue',
    items: [
      room('ゲームチャット', 'game'),
      room('パズドラチャット', 'pazudora'),
      room('3DSチャット', '3ds'),
    ],
  },
  {
    title: '季節のチャット',
    note: '季節イベントのチャット',
    tone: 'pink',
    items: [
      room('夏休みチャット', 'natsuyasumi'),
      room('花火大会チャット', 'hanabi-taikai'),
      room('春休みチャット', 'haruyasumi'),
    ],
  },
  {
    title: '地域のチャット',
    note: 'ご近所さんを探そう',
    tone: 'blue',
    items: [
      room('関東チャット', 'area_kantoh'),
      room('北海道・東北チャット', 'area_hok_touho'),
      room('東海チャット', 'area_toukai'),
      room('関西チャット', 'area_kansai'),
      room('中・四国チャット', 'area_chu_shi'),
      room('九州・沖縄チャット', 'area_kyu_oki'),
    ],
  },
  {
    title: '趣味のチャット',
    note: '気の合う仲間を見つけよう',
    tone: 'blue',
    items: [
      room('音楽チャット', 'music'),
      room('ダンスチャット', 'dance'),
      room('旅行チャット', 'travel'),
      room('ダーツチャット', 'darts'),
      room('卓球チャット', 'tabletennis'),
    ],
  },
  {
    title: 'メルヘンチャット[モニタ]',
    note: 'メルヘン＆特殊チャット',
    tone: 'green',
    items: [
      room('おみくじチャット', 'omikuji'),
      room('カオスチャット', 'mico'),
      room('プチチャット', 'puchi'),
      room('ギャルチャット', 'gyamikuji'),
      room('メルヘンチャット１', 'meruhen1'),
      room('メルヘンチャット２', 'meruhen2'),
      room('元祖カラフルチャット', 'colorful'),
      room('ホッシーと秘密の部屋', 'hoshi'),
    ],
  },
  {
    title: 'オフ会ルーム',
    note: '関東の20代大集合！',
    tone: 'purple',
    items: [
      room('カラオケ', 'karaoke'),
      room('カラオケ２', 'karaoke2'),
      room('スポーツ', 'sports'),
      room('星ぞら', 'hoshizora'),
      room('お昼寝', 'ohirune'),
      room('牡蠣フライ', 'kakifry'),
    ],
  },
  {
    title: '歴史的チャット',
    note: 'チャット開拓の歴史的場所',
    tone: 'gray',
    items: [
      room('VIPチャット', 'vip'),
      room('初めてチャット', 'hajime-old'),
      room('まったりチャット', 'mattari'),
      room('わいわいチャット', 'wai2'),
      room('常連チャット', 'joren'),
      room('小・中学生チャット', 'shouchu'),
      room('元祖２０代チャット', '20dai'),
      room('３０代以上チャット', '30dai'),
      room('バトルチャット', 'battle'),
      room('２ショットチャット', '2shot'),
    ],
  },
];

export type NewsPart = string | { linkLabel: string; linkHref: string };

export type NewsItem = {
  parts: NewsPart[];
};

/* 表示イメージ
'中学生チャットで友達探し01にかつひろさんが入室しました。',
'東日本の大学生チャットにいなおさんが入室しました。',
'高校生チャットで友達探し02にタマ(。^ω^。)さんが入室しました。',
*/
export const news: NewsItem[] = [
  {
    parts: [
      '問い合わせは',
      { linkLabel: '管理者チャット', linkHref: buildChatRoomPath('com_sb') },
      'に連絡してください。',
    ],
  },
];

// const placeholderHref = '#';

export const pickupGroups: PickupGroup[] = [
  /* 廃止
  {
    title: '中学生チャット',
    note: '全国の中学生集まれ〜！',
    tone: 'pink',
    items: [
      '楽しい中学生チャット02',
      '空気読めない中学生チャット',
      '恋に恋する中学生チャット01',
      '中学生チャット友達探し02',
    ].map((label) => ({ label, href: placeholderHref })),
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
    ].map((label) => ({ label, href: placeholderHref })),
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
    ].map((label) => ({ label, href: placeholderHref })),
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
    ].map((label) => ({ label, href: placeholderHref })),
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
    ].map((label) => ({ label, href: placeholderHref })),
  },
  */
  {
    title: 'なりきりチャット',
    note: '好きなキャラになりきろう',
    tone: 'orange',
    items: [
      chanariRoom('デュラララ チャット', 'durarara'),
      chanariRoom('ボカロチャット', 'vocaloid'),
      chanariRoom('ヘタリア チャット', 'hetaria'),
      chanariRoom('銀魂なりきりチャット', 'gintama'),
      chanariRoom('イナズマイレブンチャット', 'inazuma11'),
      chanariRoom('テニプリチャット', 'tenipri'),
      chanariRoom('リボーンチャット', 'reborn'),
      chanariRoom('東方チャット', 'touhou'),
      chanariRoom('戦国BASARAチャット', 'basara'),
      chanariRoom('イナGOチャット', 'inazuma11go'),
      chanariRoom('バカテスチャット', 'bakatesu'),
      chanariRoom('WORKING!!チャット', 'working'),
      chanariRoom('AKB48チャット', 'akb48'),
      chanariRoom('とある魔術の禁書目録チャット', 'majutu'),
      chanariRoom('BLEACHチャット', 'bleach'),
      chanariRoom('黒執事チャット', 'kuroshitsuji'),
      chanariRoom('けいおんチャット', 'keion'),
      chanariRoom('Dグレチャット', 'dgrayman'),
      chanariRoom('涼宮ハルヒの憂鬱チャット', 'haruhi'),
      chanariRoom('とある科学のレールガンチャット', 'railgun'),
    ],
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
