/**
 * 部屋の画面（入室フォーム・発言フォーム・ログ・参加者・部屋の紹介・フィルタの確認）の決まった文言。
 * Android 版も同じ文言を出す（contracts の chat-texts.json に書き出す）。`{name}` などは fillText で埋める。
 * 失敗の文言は uiMessages.ts、サーバーの入力の誤りは inputErrorMessages.ts。
 */
export const CHAT_TEXTS = {
  entry: {
    nameLabel: 'おなまえ',
    nameHint: '記入してね！',
    submit: 'チャットに参加する',
    submitting: '参加中...',
    reset: 'リセット',
    colorLabel: '名前の色',
    colorNavi: 'カラーナビ',
    silent: 'こっそり',
    emailLabel: 'E-Mail/URL:',
    emailPlaceholder: '任意',
    emailAria: 'E-Mail/URL',
    avatarNone: 'なし',
    avatarNoneLabel: 'アバターなし',
    avatarLabel: 'アバター {id}',
    credit: 'ゆいちゃっと Pro(Free)',
    creditUrl: 'https://www.cup.com/yui/',
  },
  room: {
    exit: '[退室]',
    ranking: '[ランキング]',
    reload: '更新',
    send: '発言',
    clear: '消す',
    namePrefix: 'おなまえ:',
    messagePlaceholder: '発言',
    rowsLabel: 'ログ行数:',
    rowsAria: 'ログ行数',
    sizeAria: 'フォントサイズ',
    colorAria: 'フォントカラー',
    sizeLabel: 'Size:',
    colorLabel: '色:',
    thin: '細字',
    filter: 'フィルタ',
    filterCount: 'フィルタ({count})',
    /** 返信先の部屋の名前（太字）の後に続ける。Web は名前を別の要素にするので、{title} を空にして後ろだけを使う */
    replying: '{title}に返信中',
    replyingReset: 'クリックで全部屋まとめに戻す',
  },
  log: {
    loading: 'チャットログを読み込み中...',
    empty: 'まだ発言はありません。',
    emptyFiltered: '表示できる発言はありません（{count} 件をフィルタ中）。',
    sending: '送信中...',
    profileSuffix: ' プロフィールも作ってみてね',
    visitCount: '{count}回目',
    lastLogin: 'LAST LOGIN:',
    unknownRoom: '不明な部屋',
    replyTo: '{title}に返信',
  },
  participants: {
    label: '参加者({count}):',
    none: '（なし）',
    /** レガシー風の固定リンク（文字だけ。どこにもつながない） */
    legacyLinks: [
      'ランキング',
      '詩',
      '待',
      'フィルタ方法',
      'ルール',
      '勧誘は禁止です',
      'みんなっ【いいね】してね！',
    ],
  },
  roomInfo: {
    category: 'カテゴリ: ',
    related: ' ／ 他の部屋: ',
    top: '部屋一覧（トップページ）へ',
  },
  filter: {
    ipTitle: '{ip} の発言をフィルタ（非表示に）しますか？',
    ipDescription: '同じ IP の発言がすべて隠れます。「フィルタ」から解除できます。',
    nameTitle: '「{name}」の発言をフィルタ（非表示に）しますか？',
    nameDescription: '同じ名前の発言と入退室がすべて隠れます。「フィルタ」から解除できます。',
    wordTitle: 'この言葉を含む発言をフィルタ（非表示に）しますか？',
    wordDescription: '同じ言葉を含む発言がすべて隠れます。「フィルタ」から解除できます。',
    ipAnnounce: '{ip} の発言を非表示にしました。「フィルタ」から解除できます。',
    nameAnnounce: '「{name}」の発言を非表示にしました。「フィルタ」から解除できます。',
    wordAnnounce: '「{word}」を含む発言を非表示にしました。「フィルタ」から解除できます。',
    confirm: 'フィルタする',
    cancel: 'やめる',
  },
  /** 通報（.kiro/specs/android-native-app design.md §7.6、Task 0.6）。フィルタの確認の窓から開く */
  report: {
    action: '通報する',
    title: 'この発言を運営に通報しますか？',
    description: '通報は運営だけが見ます。相手には知らされません。',
    reasonLabel: '理由',
    detailLabel: '説明（任意・500 文字まで）',
    send: '通報する',
    sending: '送っています...',
    cancel: 'やめる',
    close: '閉じる',
    accepted: '通報を受け付けました。運営が確かめます。ありがとうございました。',
    rateLimited: '通報が多すぎます。時間をおいてもう一度お試しください。',
    notFound: 'この発言は見つかりませんでした。',
    failed: '通報を送れませんでした。時間をおいてもう一度お試しください。',
    childSafetyHelp:
      '子どもが危ない目にあっているときは、すぐに警察（110）か児童相談所の虐待対応ダイヤル（189）に連絡してください。インターネット上の違法な情報は、インターネット・ホットラインセンターにも通報できます。',
    childSafetyLinkLabel: 'インターネット・ホットラインセンター',
    childSafetyLinkUrl: 'https://www.internethotline.jp/',
  },
  /** 発言ランキング（ChatRanking） */
  ranking: {
    titleSuffix: 'の発言ランキング',
    name: 'おなまえ',
    count: '発言回数',
    lastTime: '最終発言時刻',
    host: 'ホスト情報',
    empty: 'データなし',
    failed: 'ランキングを読み込めませんでした',
    loading: '読み込み中...',
  },
  /** 言葉のフィルタで言葉を選ぶ欄（WordPicker） */
  wordPicker: {
    label: '非表示にする言葉（上の発言から選ぶか、入力してください）',
    matches: 'この言葉を含む発言: {count} 件',
    empty: '言葉が空です',
  },
  /** フィルタの一覧（FilterListDialog） */
  filterList: {
    title: 'フィルタ',
    titleCount: 'フィルタ（{count}）',
    close: '閉じる',
    none: 'フィルタしているものはありません。',
    kindName: '名前',
    kindWord: '言葉',
    count: '{kind}・{count} 件',
    remove: '解除',
    removeIp: '{ip} のフィルタを解除',
    removeName: '名前「{name}」のフィルタを解除',
    removeWord: '言葉「{word}」のフィルタを解除',
    removeAll: 'すべて解除',
    note: 'IPは一部を伏せた値で比べるため、別の人の発言も一緒に隠れることがあります。このブラウザの中だけの設定です。',
  },
  /** 通報の理由（キーは report-chat の REPORT_REASONS） */
  reportReasons: {
    spam: '宣伝・スパム',
    harassment: '嫌がらせ・誹謗中傷',
    sexual: '性的な内容',
    child_safety: '児童の安全に関わる',
    personal_info: '個人情報の書き込み',
    other: 'その他',
  },
} as const;

/** `{key}` を values の値で埋める */
export function fillText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
