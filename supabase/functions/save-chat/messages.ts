// サーバーが作る発言（入退室の管理人）の文言と形。save-chat が保存する内容の正で、Web は楽観的な表示にだけ
// 同じ関数を使う（docs/SERVER_SIDE_LOGIC_REFACTORING.md の S5、Issue #180）。
//
// import を持たない。Deno（Edge Function）と Vitest（Web）の両方から読むため。
// 誰が入った・出たかは metadata の event / subject に構造で書く（Issue #183）。クライアントは構造で読み、
// 構造の無い古い行だけを本文の正規表現で読む。本文の文言は今のままにする（古いクライアントが正規表現で読むため）。

export const ADMIN_NAME = '管理人';
export const ADMIN_COLOR = '#ffffff';
export const ADMIN_AVATAR = 'hoshi1';
/** userColor が読めないときの色（ChatMessage が userColor の無い管理人の発言に使う色と同じ） */
export const ADMIN_FALLBACK_USER_COLOR = '#ff69b4';

export type AdminEvent = 'enter' | 'exit';

export function enterMessage(name: string): string {
  return `${name} さん、Welcome to お気楽チャット☆`;
}

export function exitMessage(name: string): string {
  return `${name}さん、またきておくれやすぅ。`;
}

export interface AdminChatInput {
  event: AdminEvent;
  /** 入退室した人の名前と色 */
  name: string;
  color: string;
  /** 入室だけ: 訪問回数と前回のログイン（端末の中の値。サーバーは範囲に丸めてから渡す） */
  visitCount?: number;
  lastLogin?: number;
  /** 楽観的な行と突き合わせるための nonce */
  nonce?: string;
}

export interface AdminChat {
  name: string;
  color: string;
  message: string;
  system: true;
  metadata: {
    version: 1;
    avatar: typeof ADMIN_AVATAR;
    kind: 'admin';
    userColor: string;
    fontStyle: { bold: true };
    visitCount?: number;
    lastLogin?: number;
    optimisticNonce?: string;
    /** 入室か退室か（Issue #183）。サーバーが作る発言だけに付く */
    event: AdminEvent;
    /** 入退室した人（Issue #183） */
    subject: { name: string; color: string };
  };
}

/** 入退室の管理人の発言。以前の Web（useChatSession + createAdminChat）が作っていたものと同じ */
export function buildAdminChat(input: AdminChatInput): AdminChat {
  const metadata: AdminChat['metadata'] = {
    version: 1,
    avatar: ADMIN_AVATAR,
    kind: 'admin',
    userColor: input.color,
    fontStyle: { bold: true },
    event: input.event,
    subject: { name: input.name, color: input.color },
  };
  if (input.event === 'enter') {
    if (input.visitCount !== undefined) metadata.visitCount = input.visitCount;
    if (input.lastLogin !== undefined) metadata.lastLogin = input.lastLogin;
  }
  if (input.nonce !== undefined) metadata.optimisticNonce = input.nonce;
  return {
    name: ADMIN_NAME,
    color: ADMIN_COLOR,
    message: input.event === 'enter' ? enterMessage(input.name) : exitMessage(input.name),
    system: true,
    metadata,
  };
}

// --- おみくじ（Issue #181、docs/SERVER_SIDE_LOGIC_REFACTORING.md の S6）---
//
// 利用者が「おみくじ」と発言すると、save-chat が利用者の発言と巫女の返事を 1 回の insert_chat で保存する。

export const FORTUNE_NAME = '巫女';
export const FORTUNE_COLOR = 'hotpink';
export const FORTUNE_AVATAR = 'miko1';

/**
 * オリジナルCGIチャット（YuiChat-Pro kuji.dat）由来の運勢メッセージリスト。
 * Shift-JISからデコードした原文をそのまま使用。
 */
export const FORTUNE_MESSAGES: readonly string[] = [
  '大吉で〜す。うまい話が転がり込んできます。仕事は早目に片付けて出かけましょう。',
  '凶で〜す。邁進せずに内を固める必要があるようです..。自己過信すると道を間違えるわね..。',
  '大吉で〜す。任されたら責任持って進むのがいいです。不慣れな事柄なら携わらぬようにね。',
  '中吉で〜す。一気に攻めると挫折しやすいです。計画をきちんと立てて前進しませう。',
  '中吉で〜す。不満な所は素直に言うべきです。環境改善がツキの流れを良くするわ..。',
  '大凶で〜す。人間関係に歪みを出さないのがいいです。感情に触るような言葉はさけましょう。',
  '中吉で〜す。理屈通そうとすると無理があるようです..。その場に合わせた判断すればよいでしょう。',
  '凶で〜す。我欲にとらわれると失敗するわね..。周りのために働くことを考えてくださいね。',
  '凶で〜す。口先だけの約束をすると大失点。信用がなければ仕事も来ない。',
  '大吉で〜す。上司を頼りにすれば喜ばれるわね..。大いに利用して事を進めるべきです。',
  '凶で〜す。甘い誘いにフラフラしないのがいいです。自ら危険なワナにはまりやすいです。',
  '大吉で〜す。情報の聞き漏らしないか確認しませう。普段より順調に運び一段落します。',
];

/** おみくじの発言か。前後の空白を除いて `おみくじ` と一致するときだけ */
export function isFortuneCommand(message: string): boolean {
  return message.trim() === 'おみくじ';
}

export interface FortuneChat {
  name: typeof FORTUNE_NAME;
  color: typeof FORTUNE_COLOR;
  message: string;
  system: true;
  metadata: {
    version: 1;
    kind: 'fortune';
    avatar: typeof FORTUNE_AVATAR;
    fontStyle: { bold: true };
  };
}

/**
 * 巫女の返事。形式は `{運勢}＞{名前}さん`。`index` は 0 以上 FORTUNE_MESSAGES.length 未満
 * （呼び出し側が乱数で選ぶ。テストで固定できるように外から渡す）。
 */
export function buildFortuneChat(userName: string, index: number): FortuneChat {
  const fortune = FORTUNE_MESSAGES[index] ?? FORTUNE_MESSAGES[0];
  return {
    name: FORTUNE_NAME,
    color: FORTUNE_COLOR,
    message: `${fortune}＞${userName}さん`,
    system: true,
    metadata: { version: 1, kind: 'fortune', avatar: FORTUNE_AVATAR, fontStyle: { bold: true } },
  };
}
