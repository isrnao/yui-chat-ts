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
  // 管理者チャット
  'com_sb',
  // なりきりチャット (chanari)
  'durarara',
  'vocaloid',
  'hetaria',
  'gintama',
  'inazuma11',
  'tenipri',
  'touhou',
  'basara',
  'inazuma11go',
  'bakatesu',
  'working',
  'akb48',
  'majutu',
  'bleach',
  'kuroshitsuji',
  'keion',
  'dgrayman',
  'haruhi',
  'railgun',
  // Chat-All 専用
  'all',
] as const;

export type RoomId = (typeof CHAT_ROOM_IDS)[number];

/**
 * 部屋カテゴリ。CHAT_ROOM_IDS のコメントによる分類をデータに昇格させたもの。
 * BreadcrumbList 構造化データと同カテゴリの関連部屋リンクの導出元になる
 * (.kiro/specs/seo-improvement Req 6)。
 */
export const ROOM_CATEGORIES = [
  'beginner',
  'student',
  'generation',
  'daily',
  'anime',
  'game',
  'season',
  'area',
  'hobby',
  'meruhen',
  'offkai',
  'historic',
  'admin',
  'chanari',
  'all',
] as const;

export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export const ROOM_CATEGORY_LABELS: Record<RoomCategory, string> = {
  beginner: '初心者チャット',
  student: '学生チャット',
  generation: '年代別チャット',
  daily: '日常生活のチャット',
  anime: 'アニメチャット',
  game: 'ゲームチャット',
  season: '季節のチャット',
  area: '地域のチャット',
  hobby: '趣味のチャット',
  meruhen: 'メルヘンチャット',
  offkai: 'オフ会ルーム',
  historic: '歴史的チャット',
  admin: '管理者チャット',
  chanari: 'なりきりチャット',
  all: '全部屋まとめ',
};

export type RoomMeta = {
  id: RoomId;
  title: string;
  description: string;
  category: RoomCategory;
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

  com_sb: '管理者チャット',

  durarara: 'デュラララ チャット',
  vocaloid: 'ボカロチャット',
  hetaria: 'ヘタリア チャット',
  // `gintama` は /chat/gintama (通常: 銀魂チャット) と
  // /chanari/gintama (なりきり用) で同一 ID を共有する。
  // 表示ラベルは data.ts 側で section ごとに使い分ける。
  gintama: '銀魂チャット',
  inazuma11: 'イナズマイレブンチャット',
  tenipri: 'テニプリチャット',
  touhou: '東方チャット',
  basara: '戦国BASARAチャット',
  inazuma11go: 'イナGOチャット',
  bakatesu: 'バカテスチャット',
  working: 'WORKING!!チャット',
  akb48: 'AKB48チャット',
  majutu: 'とある魔術の禁書目録チャット',
  bleach: 'BLEACHチャット',
  kuroshitsuji: '黒執事チャット',
  keion: 'けいおんチャット',
  dgrayman: 'Dグレチャット',
  haruhi: '涼宮ハルヒの憂鬱チャット',
  railgun: 'とある科学のレールガンチャット',
  all: '全部屋まとめ',
};

/**
 * 各ルームのカテゴリ。CHAT_ROOM_IDS の並び (コメント区分) と一致させる。
 * Record<RoomId, RoomCategory> なので部屋の追加時は型エラーで登録漏れに気づける。
 */
const ROOM_CATEGORY_MAP: Record<RoomId, RoomCategory> = {
  superbeginner: 'beginner',
  hajime: 'beginner',
  ofall: 'beginner',
  yume: 'beginner',

  elementary: 'student',
  juniorhighschool: 'student',
  juniorhighschool3: 'student',
  highschool: 'student',
  daigaku: 'student',

  '10generations': 'generation',
  '20generations': 'generation',
  '30generations': 'generation',

  umaimise: 'daily',
  osare: 'daily',
  news: 'daily',
  jinsei: 'daily',

  anime: 'anime',
  reborn: 'anime',
  monhan: 'anime',
  rozen: 'anime',

  game: 'game',
  pazudora: 'game',
  '3ds': 'game',

  natsuyasumi: 'season',
  'hanabi-taikai': 'season',
  haruyasumi: 'season',

  area_kantoh: 'area',
  area_hok_touho: 'area',
  area_toukai: 'area',
  area_kansai: 'area',
  area_chu_shi: 'area',
  area_kyu_oki: 'area',

  music: 'hobby',
  dance: 'hobby',
  travel: 'hobby',
  darts: 'hobby',
  tabletennis: 'hobby',

  omikuji: 'meruhen',
  mico: 'meruhen',
  puchi: 'meruhen',
  gyamikuji: 'meruhen',
  meruhen1: 'meruhen',
  meruhen2: 'meruhen',
  colorful: 'meruhen',
  hoshi: 'meruhen',

  karaoke: 'offkai',
  karaoke2: 'offkai',
  sports: 'offkai',
  hoshizora: 'offkai',
  ohirune: 'offkai',
  kakifry: 'offkai',

  vip: 'historic',
  'hajime-old': 'historic',
  mattari: 'historic',
  wai2: 'historic',
  joren: 'historic',
  shouchu: 'historic',
  '20dai': 'historic',
  '30dai': 'historic',
  battle: 'historic',
  '2shot': 'historic',

  com_sb: 'admin',

  durarara: 'chanari',
  vocaloid: 'chanari',
  hetaria: 'chanari',
  gintama: 'chanari',
  inazuma11: 'chanari',
  tenipri: 'chanari',
  touhou: 'chanari',
  basara: 'chanari',
  inazuma11go: 'chanari',
  bakatesu: 'chanari',
  working: 'chanari',
  akb48: 'chanari',
  majutu: 'chanari',
  bleach: 'chanari',
  kuroshitsuji: 'chanari',
  keion: 'chanari',
  dgrayman: 'chanari',
  haruhi: 'chanari',
  railgun: 'chanari',

  all: 'all',
};

/**
 * 各ルームの手書き紹介文 (誰向けか・何を話す部屋か)。
 * ページの meta description・プリレンダ HTML の本文・画面読み上げ用見出し・なりきり画面のヘッダーに使われる。
 * テンプレ一括生成は SEO 上「実質同一の薄いページ群」と評価されるため禁止
 * (.kiro/specs/seo-improvement Req 6)。
 * 制約 (rooms.test.ts で機械検証): 全部屋で重複しない文面・70〜120 文字。
 */
const ROOM_DESCRIPTIONS: Record<RoomId, string> = {
  superbeginner:
    'チャットが初めての方のための超初心者向けの部屋です。使い方が分からなくても大丈夫。挨拶だけでも歓迎なので、まずは気軽に発言して雰囲気に慣れていきましょう。',
  hajime:
    '初めて訪れた人同士が「初めまして」から始める部屋です。自己紹介や好きな話題をきっかけに、新しい友達作りや仲間探しをのんびり楽しめる無料チャットです。',
  ofall:
    '年齢も話題も問わない、誰でも参加できるみんなの雑談部屋です。日常の出来事から趣味の話まで、思いついたことを自由におしゃべりして交流を楽しみましょう。',
  yume: '将来の夢や目標、挑戦したいことを語り合う部屋です。進路の悩みや頑張っていることを共有して、お互いに励まし合える前向きな仲間を見つけられる場所です。',

  elementary:
    '小学生のためのおしゃべり部屋です。学校での出来事や流行りの遊び、ゲームの話題までみんなで楽しくお話しできます。本名や住所などの個人情報は書かないでね。',
  juniorhighschool:
    '中学生同士で気軽に話せる部屋です。部活や勉強、恋バナに流行の話題まで、身近な人には少し話しづらいことも同世代の仲間となら盛り上がれる学生チャットです。',
  juniorhighschool3:
    '中学生チャットの3番目の部屋です。本館がにぎやかな時の避難先として、少人数でまったり話したい中学生におすすめ。話題は自由で、途中参加も大歓迎です。',
  highschool:
    '高校生のための雑談部屋です。テストや部活、バイトや進路の話から放課後の暇つぶしまで、全国の高校生とリアルタイムでおしゃべりできる学生チャットです。',
  daigaku:
    '大学生・専門学生のための部屋です。講義やサークル、就活や一人暮らしの話題など、キャンパスライフのあれこれを同世代の仲間と気軽に語り合いましょう。',

  '10generations':
    '10代向けの話題で盛り上がる部屋です。学校や友達関係、流行りの音楽や動画の話など、同じ時代を生きる10代同士だからこそ通じる話題を楽しめます。',
  '20generations':
    '20代のための雑談部屋です。仕事や恋愛、お金や将来のことまで、社会に出たばかりの世代ならではの悩みや楽しみを同年代と気軽に話せる場所です。登録不要ですぐ参加できます。',
  '30generations':
    '30代同士でゆったり話せる部屋です。仕事や家庭、趣味や健康の話題など、落ち着いた雰囲気の中で同世代とのんびりおしゃべりを楽しめます。仕事帰りの息抜きにもどうぞ。',

  umaimise:
    'おすすめの飲食店やご当地グルメを語り合う部屋です。地元の隠れた名店から話題のお店まで、食べ歩きが好きな仲間と旨い店の情報を交換できます。食いしん坊さん大歓迎です。',
  osare:
    'ファッションや美容の話題を楽しむ部屋です。今日のコーデや古着、コスメやヘアアレンジの話まで、お洒落が好きな仲間と気軽に情報交換しましょう。見る専の参加も歓迎です。',
  news: '気になるニュースや時事の話題を語り合う部屋です。世の中の出来事について、いろいろな立場の人と落ち着いて意見を交わしてみたい方におすすめです。',
  jinsei:
    '恋愛や仕事、人間関係の悩みを聞いてもらえる人生相談の部屋です。匿名だからこそ話せる本音を、通りすがりの誰かがそっと受け止めてくれる場所です。',

  anime:
    '今期の新作から懐かしの名作まで、アニメの話題なら何でもありの部屋です。好きな作品やキャラクターへの想いを、同じアニメ好きの仲間と語り明かしましょう。',
  reborn:
    '『家庭教師ヒットマンREBORN!』が好きな人のための部屋です。お気に入りのキャラや守護者の話、原作の名場面などをファン同士でじっくり語り合えます。',
  monhan:
    'モンスターハンターシリーズの話題で盛り上がる部屋です。武器の談義や装備構成の相談、思い出に残る狩猟の話まで、ハンター仲間との交流を楽しめます。',
  rozen:
    '『ローゼンメイデン』のファンが集う部屋です。お気に入りのドールの話や物語の考察、アニメと原作の話題まで、静かな空気の中で深く語り合えます。初見さんもお気軽にどうぞ。',

  game: 'ジャンルを問わずゲームの話題を楽しむ部屋です。家庭用からスマホゲームまで、いま遊んでいる作品の話や攻略情報をゲーマー同士で気軽に共有できます。',
  pazudora:
    'パズル＆ドラゴンズの話題専門の部屋です。手持ちのパーティ編成の相談や降臨攻略、ガチャの結果報告まで、パズドラ仲間とわいわい語り合えます。初心者の質問も大歓迎です。',
  '3ds':
    'ニンテンドー3DSの思い出とソフトを語る部屋です。すれちがい通信の思い出や好きだったタイトルの話題で、当時を知る仲間と懐かしく盛り上がりましょう。',

  natsuyasumi:
    '夏休み気分でおしゃべりする季節の部屋です。旅行や宿題、夏祭りや海の思い出など、夏らしい話題でのんびり過ごしたい人が集まる場所です。夏の思い出作りにどうぞ。',
  'hanabi-taikai':
    '花火大会の話題でにぎわう夏の部屋です。各地の花火大会の情報交換や当日の実況、夏の夜の雑談など、季節の風物詩をみんなで一緒に楽しみましょう。浴衣の話題も歓迎です。',
  haruyasumi:
    '春休みシーズンの雑談部屋です。進級や新生活の準備、春のお出かけ計画など、出会いと別れの季節ならではの話題でゆっくりおしゃべりできます。新生活の情報交換にもどうぞ。',

  area_kantoh:
    '関東地方に住んでいる人・関東が好きな人のための部屋です。地元の話題やおすすめスポット、方言や学校の話などで地域の仲間とつながることができます。',
  area_hok_touho:
    '北海道・東北地方の人が集まる部屋です。雪国あるあるや地元グルメ、方言の話題など、北の地域ならではの話でゆっくり交流できる地域チャットです。帰省の話題も歓迎です。',
  area_toukai:
    '東海地方の人のための地域チャットです。名古屋めしや地元イベントの話題、通学・通勤あるあるなど、東海ならではの身近な話で盛り上がれます。観光の質問も気軽にどうぞ。',
  area_kansai:
    '関西の人が集まるノリのいい部屋です。関西弁が飛び交う雑談や地元ネタ、お笑いの話題まで、関西らしいテンポのおしゃべりを楽しめる地域チャットです。',
  area_chu_shi:
    '中国・四国地方の人のための部屋です。瀬戸内や山陰・山陽の地元話、方言やお祭りの話題など、のんびりした空気の中で地域の仲間と話せます。移住や観光の話題も歓迎です。',
  area_kyu_oki:
    '九州・沖縄の人が集まる部屋です。地元の美味しいものや方言、島の暮らしの話題など、南の地域ならではのあたたかい交流が楽しめる場所です。旅行前の質問にもどうぞ。',

  music:
    '好きな音楽を語り合う部屋です。J-POPからロック、ボカロにアニソンまでジャンル不問。おすすめ曲の紹介や楽器の話題で音楽仲間を見つけましょう。',
  dance:
    'ダンスが好きな人のための部屋です。ヒップホップやロックダンスの練習話、好きなダンサーや発表会の話題まで、踊る仲間と楽しく交流できます。初心者からの相談も歓迎です。',
  travel:
    '旅の話題を楽しむ部屋です。おすすめの観光地や旅先での思い出、次の旅行計画の相談など、旅好き同士の情報交換や雑談にぴったりの場所です。一人旅派もグループ派もどうぞ。',
  darts:
    'ダーツ好きが集まる部屋です。マイダーツのセッティングや上達のコツ、行きつけのお店の話など、初心者から上級者まで一緒に楽しめる趣味チャットです。',
  tabletennis:
    '卓球の話題専門の部屋です。ラバーやラケットの用具談義、練習方法や試合の思い出まで、卓球が好きな仲間同士でじっくり語り合うことができます。部活勢も社会人勢も歓迎です。',

  omikuji:
    '入室したらまずおみくじ気分で挨拶する、ゆるくて不思議な部屋です。今日の運勢の話や何気ない雑談など、ふらっと立ち寄る人をいつでも歓迎します。運試し気分で一言どうぞ。',
  mico: '何が起こるか分からないカオスな部屋です。ノリと勢いの雑談や大喜利のような掛け合いなど、自由すぎる空気をそのまま楽しめる人に向いています。初見さんは勇気を出してどうぞ。',
  puchi:
    'ちょっとした空き時間にぴったりの小さな部屋です。一言だけの挨拶や短い雑談など、肩の力を抜いたプチサイズのおしゃべりを気軽にどうぞ。登録不要ですぐに入れます。',
  gyamikuji:
    'ギャル文化とノリが好きな人の部屋です。メイクやファッションの話題、テンション高めの雑談で、懐かしい平成ギャル気分を一緒に楽しめます。ノリのいい人をお待ちしています。',
  meruhen1:
    'ふんわりした雰囲気でおしゃべりするメルヘンな部屋の1号室です。かわいいものや空想の話題など、優しい空気の中でのんびり過ごすことができます。疲れた日の癒やしにどうぞ。',
  meruhen2:
    'メルヘンチャットの2号室です。1号室がにぎやかな時はこちらでどうぞ。夢のある話題やほのぼのとした雑談を、静かな空気の中で楽しめます。初めての方も安心の雰囲気です。',
  colorful:
    '文字色を使い分けてにぎやかに話す元祖カラフルな部屋です。色とりどりの発言が画面を流れる、レトロチャットらしい風景を一緒に楽しみましょう。お気に入りの色で発言してみてください。',
  hoshi:
    'マスコットのホッシーと過ごす秘密の部屋です。ここだけの内緒話やまったりした雑談など、隠れ家のような空気が好きな人に向いている場所です。合言葉は不要、誰でも入れます。',

  karaoke:
    'カラオケ好きが集まるオフ会ルームです。十八番の曲や採点の話題、盛り上がるおすすめの選曲まで、歌が好きな仲間と楽しく交流できます。ヒトカラ派の参加も歓迎です。',
  karaoke2:
    'カラオケルームの2番目の部屋です。本室がにぎやかな時はこちらでどうぞ。好きなアーティストや歌いたい曲の話を、少人数で落ち着いて楽しめます。選曲の相談も気軽にどうぞ。',
  sports:
    'スポーツの話題で集まるオフ会ルームです。観戦の感想やひいきのチーム、自分がやっている競技の話まで、スポーツ好き同士で盛り上がれます。運動不足の雑談でも大丈夫です。',
  hoshizora:
    '夜空を眺めながら話すような、静かな夜向けのオフ会ルームです。星や天体の話題、眠れない夜のぽつりぽつりとした雑談などにちょうどいい場所です。流星群の夜は特ににぎわいます。',
  ohirune:
    'お昼寝前後のまどろみ気分で過ごすゆるい部屋です。眠い報告やだらだらした雑談など、急かされない空気の中でのんびりしたい人の溜まり場です。寝落ちしても怒られません。',
  kakifry:
    'なぜか牡蠣フライの名を冠した名物オフ会ルームです。グルメの話題から名前の由来をめぐるネタ話まで、ゆるくて濃い常連の雑談が楽しめます。初めての方は由来を聞いてみてください。',

  vip: 'ネット掲示板のノリを懐かしむVIPな部屋です。全盛期のネタや独特の言い回しなど、あの頃のインターネット文化を知る人同士で盛り上がれます。古のネット用語も通じます。',
  'hajime-old':
    'かつての「初めてチャット」を再現した歴史的な部屋です。当時ここで出会った人も、初めて来た人も、懐かしい空気の中で自由におしゃべりできます。思い出探しの再訪も歓迎です。',
  mattari:
    'その名の通りまったり過ごす老舗の部屋です。急がない会話と穏やかな空気が持ち味で、疲れた日にふらっと立ち寄りたくなる居心地のいい場所です。無言の見学からでも大丈夫です。',
  wai2: '大人数でわいわい盛り上がるのが伝統の部屋です。次々に流れる発言の中に飛び込んで、にぎやかなレトロチャットならではの醍醐味を味わってください。',
  joren:
    '常連さんたちが集う歴史ある部屋です。昔からの顔なじみも初めての方も歓迎。長く通いたくなる、居心地のいい空気が自慢のコミュニティです。新しい常連さんも募集中です。',
  shouchu:
    '小学生・中学生のための歴史ある部屋です。学校の話題や好きな遊びの話などを気軽にどうぞ。個人情報は書かずに、放課後の待ち合わせ場所のように使ってね。',
  '20dai':
    '20代チャットの元祖にあたる歴史的な部屋です。当時の空気を残したまま、仕事や恋愛など20代らしい話題で今もおしゃべりが続いています。同世代の友達作りにどうぞ。',
  '30dai':
    '30代以上の大人のための部屋です。仕事や家族のこと、昔のインターネットの思い出話など、落ち着いた世代同士でゆっくり語り合うことができます。懐かしい話題が通じる場所です。',
  battle:
    '言葉のバトルを楽しむ刺激的な部屋です。討論やなりきりバトル、大喜利の対決など、ルールを守った真剣勝負でにぎやかに盛り上がりましょう。腕に覚えのある方はぜひどうぞ。',
  '2shot':
    '昔ながらの2ショットチャットの文化を再現した部屋です。一対一の会話の雰囲気を楽しめますが、発言は公開ログとして誰でも読めるので個人情報には注意してね。',

  com_sb:
    '管理者宛ての連絡やご要望を受け付ける部屋です。発言は他の部屋と同じく公開されるので、個人情報は書かずに、不具合や荒らし報告の概要だけをお知らせください。',

  durarara:
    '『デュラララ!!』のなりきりチャットです。池袋の住人になりきって会話を楽しんだり、作品の考察や好きなキャラクターの話題で盛り上がったりできます。',
  vocaloid:
    'ボーカロイドが好きな人のための部屋です。好きなボカロ曲やボカロPの話題、キャラクターになりきった会話まで、ボカロ文化をまるごと楽しめます。推し曲の布教も大歓迎です。',
  hetaria:
    '『ヘタリア』のなりきりチャットです。お気に入りの国のキャラクターになりきった会話や、作品の話題を通じてファン同士の交流を楽しめます。世界史の小ネタ話も歓迎です。',
  gintama:
    '『銀魂』が好きな人のための部屋です。かぶき町の住人になりきったやり取りや、名場面・ギャグ回の話題で、ファン同士わいわい盛り上がれます。アニメ派も原作派も歓迎です。',
  inazuma11:
    '『イナズマイレブン』のなりきりチャットです。好きな選手になりきった試合ごっこや、必殺技と名勝負の話題で、サッカー好きの仲間と楽しめます。無印世代の思い出話もどうぞ。',
  tenipri:
    '『テニスの王子様』のなりきりチャットです。各校の選手になりきった会話や、好きなキャラクター・名試合の話題でファン同士の交流ができます。推し校の布教もお待ちしています。',
  touhou:
    '東方Projectが好きな人の部屋です。幻想郷のキャラクターになりきった会話から、原作・音楽・二次創作の話題まで幅広く楽しめるなりきりチャットです。',
  basara:
    '『戦国BASARA』のなりきりチャットです。武将になりきった威勢のいい掛け合いや、好きなキャラクター・名台詞の話題で戦国気分を味わえます。ゲーム派もアニメ派も歓迎です。',
  inazuma11go:
    '『イナズマイレブンGO』専門のなりきりチャットです。GO世代の選手になりきって、化身や必殺技、名場面の話題で同じファンの仲間と盛り上がれます。',
  bakatesu:
    '『バカとテストと召喚獣』のなりきりチャットです。文月学園の生徒になりきった試召戦争ごっこや、作品の好きな場面の話題を楽しむことができます。クラス分けの妄想話も歓迎です。',
  working:
    '『WORKING!!』のなりきりチャットです。ワグナリアの店員になりきった会話や、好きなキャラクターの話題で、ファン同士まったり交流できます。',
  akb48:
    'AKB48グループが好きな人の部屋です。推しメンの話題や楽曲・公演の感想、当時の総選挙の思い出話まで、ファン同士で懐かしく語り合えます。他グループの話題も大丈夫です。',
  majutu:
    '『とある魔術の禁書目録』のなりきりチャットです。学園都市や魔術サイドのキャラクターになりきった会話や、原作の考察話で盛り上がることができます。',
  bleach:
    '『BLEACH』のなりきりチャットです。死神や護廷十三隊の隊士になりきった会話、卍解や名場面の話題など、ファン同士の交流を楽しめます。千年血戦篇の話題もどうぞ。',
  kuroshitsuji:
    '『黒執事』のなりきりチャットです。執事や使用人になりきった優雅な会話や、作品の世界観・考察の話題を、落ち着いた空気でじっくり楽しめます。紅茶片手の参加がおすすめです。',
  keion:
    '『けいおん!』が好きな人の部屋です。放課後ティータイムの話題や楽器の話、部員になりきったゆるい会話で、まったりした時間を過ごせます。楽器を始めた報告もお待ちしています。',
  dgrayman:
    '『D.Gray-man』のなりきりチャットです。エクソシストになりきった会話や、物語の考察・好きなキャラクターの話題でファン同士交流できます。',
  haruhi:
    '『涼宮ハルヒの憂鬱』のなりきりチャットです。SOS団の一員になりきった会話や、作品の考察・名場面の話題を、同じファンの仲間と楽しめます。団員気分での参加も大歓迎です。',
  railgun:
    '『とある科学の超電磁砲』のなりきりチャットです。学園都市の能力者になりきった会話や、好きなキャラクターの話題でファン同士盛り上がれます。超電磁砲派も禁書派も歓迎です。',

  all: 'すべての部屋の発言を1画面でまとめて眺められる横断ビューです。いまどの部屋がにぎわっているかを見つけたり、全部屋の流れをのんびり追いかけたりできます。',
};

function buildRoomMeta(): Record<RoomId, RoomMeta> {
  const entries = CHAT_ROOM_IDS.map((id): [RoomId, RoomMeta] => [
    id,
    {
      id,
      title: ROOM_TITLES[id],
      description: ROOM_DESCRIPTIONS[id],
      category: ROOM_CATEGORY_MAP[id],
      enabled: true,
    },
  ]);
  return Object.fromEntries(entries) as Record<RoomId, RoomMeta>;
}

export const CHAT_ROOMS: Record<RoomId, RoomMeta> = buildRoomMeta();

export function isRoomId(value: string): value is RoomId {
  return Object.prototype.hasOwnProperty.call(CHAT_ROOMS, value);
}

export function isEnabledRoomId(value: string): value is RoomId {
  return isRoomId(value) && CHAT_ROOMS[value].enabled;
}

export function getListableRoomIds(): ReadonlyArray<RoomId> {
  return CHAT_ROOM_IDS.filter((id) => id !== 'all') as ReadonlyArray<RoomId>;
}

export function getRoomMeta(roomId: RoomId): RoomMeta {
  const meta = CHAT_ROOMS[roomId];
  if (!meta) {
    throw new Error(`Unknown room_id: ${roomId}`);
  }
  return meta;
}

/**
 * 同カテゴリの関連部屋 (自分自身を除く enabled な部屋、CHAT_ROOM_IDS 順)。
 * RoomInfo の関連部屋リンクとプリレンダの静的フォールバックが共用する
 * (.kiro/specs/seo-improvement Req 7: 内部リンクグラフ)。
 */
export function getRelatedRooms(roomId: RoomId, limit = 6): RoomMeta[] {
  const { category } = getRoomMeta(roomId);
  return getListableRoomIds()
    .filter((id) => id !== roomId && CHAT_ROOMS[id].enabled && CHAT_ROOMS[id].category === category)
    .slice(0, limit)
    .map((id) => CHAT_ROOMS[id]);
}
