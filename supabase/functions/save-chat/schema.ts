// 発言の入力の規則（上限と形式）。save-chat が確かめ、Web は同じ値を相対パスで import する
// （ツーショットの rules.ts と同じ形）。docs/SERVER_SIDE_LOGIC_REFACTORING.md の S1（Issue #176）。
//
// import を持たない。Deno（Edge Function）と Vitest（Web）の両方から読むため。
//
// 上限は画面より緩いか同じにして、画面を正しく使う人が拒否されないようにする。
// - 画面の maxLength は UTF-16 の単位で数える。ここはコードポイント（名前）・grapheme（発言）で
//   数えるので、同じ数でも画面より緩い
// - DB の CHECK 制約（20261006000000_chats_input_checks.sql）は最後の防壁。ここを通った値は必ず収まる
//   （名前は前後の空白を除いて保存し、発言はコードポイントでも MESSAGE_MAX_CODE_POINTS に収める）

export const NAME_MAX = 24;
export const MESSAGE_MAX = 120;
/**
 * 発言のコードポイントの上限（DB の CHECK 制約 chats_message_check と同じ値）。120 grapheme でも、結合文字を
 * 大量に重ねた 1 grapheme はこれを超えうるので、ここでも拒否する（DB で 500 にしない）
 */
export const MESSAGE_MAX_CODE_POINTS = 2000;
export const EMAIL_MAX = 64;
/**
 * 色が読めないときに保存する色。EntryForm の既定の色と同じで、入退室の管理人の発言の userColor が読めないときや、
 * ChatMessage が userColor の無い管理人の発言を出すときもこの色を使う
 */
export const DEFAULT_COLOR = '#ff69b4';

/** 入力の検証で返すエラーのコード。画面の文言はクライアントがこのコードから選ぶ */
export type InputErrorCode =
  | 'invalid_room_id'
  | 'invalid_name'
  | 'reserved_name'
  | 'invalid_message'
  | 'invalid_email';

// --- 文字数 ---

/** コードポイントの数（サロゲートペアを 1 文字と数える） */
export function countCodePoints(input: string): number {
  let count = 0;
  for (const _ of input) count++;
  return count;
}

// 最初に使うときに作る（モジュールの読み込み時に作ると、使わない画面の bundle からも消えない）
let graphemeSegmenter: Intl.Segmenter | null = null;

/** grapheme（見た目の 1 文字）の数。発言の上限と、ちゃなりの文字数カウンタが使う */
export function countGraphemes(input: string): number {
  if (input === '') return 0;
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const _ of graphemeSegmenter.segment(input)) count++;
  return count;
}

// C0・DEL・C1 の制御文字
// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

export function hasControlChars(input: string): boolean {
  return CONTROL_CHARS.test(input);
}

// --- 色 ---

/** CSS の色名（CSS Color Module Level 4 の named colors。transparent と currentcolor は含めない） */
// 一覧は最初に使うときに Set にする（モジュールの読み込み時に計算しないので、使わない画面の bundle からは消える。
// 画面は normalizeColor を使わない。楽観的な表示の色は保存の応答の color で確定する）
const CSS_COLOR_NAME_LIST = `
    aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
    brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
    darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
    darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
    darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
    forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
    hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue
    lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
    lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
    limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple
    mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue
    mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
    palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
    powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
    seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
    thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`;

let cssColorNames: ReadonlySet<string> | null = null;

/** CSS の色名か（小文字で渡す） */
export function isCssColorName(value: string): boolean {
  cssColorNames ??= new Set(CSS_COLOR_NAME_LIST.trim().split(/\s+/));
  return cssColorNames.has(value);
}

/**
 * 色を保存する形にする。`#rgb`・`#rrggbb`・CSS の色名なら前後の空白を除いて小文字にして返し、
 * それ以外は null（呼び出し側が DEFAULT_COLOR に置き換える）。
 */
export function normalizeColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) return value;
  return isCssColorName(value) ? value : null;
}

// --- 発言の入力 ---

export interface SayInput {
  /** 前後の空白を除いた名前（これを保存する） */
  name: string;
  message: string;
  color: string;
  email: string | null;
}

export type InputCheck =
  | { error: null; value: SayInput }
  /** 拒否するときのコードと、記録用の違反の名前 */
  | { error: InputErrorCode; violation: string };

/** 名前の違反（前後の空白を除いて 1〜NAME_MAX コードポイント、制御文字なし、予約名でない）。入退室でも使う */
export function checkName(name: string): { error: InputErrorCode; violation: string } | null {
  const length = countCodePoints(name.trim());
  if (length === 0) return { error: 'invalid_name', violation: 'name_blank' };
  if (length > NAME_MAX) return { error: 'invalid_name', violation: 'name_too_long' };
  if (hasControlChars(name)) return { error: 'invalid_name', violation: 'name_control_chars' };
  if (isReservedName(name)) return { error: 'reserved_name', violation: 'name_reserved' };
  return null;
}

// --- 予約名（Issue #182、docs/SERVER_SIDE_LOGIC_REFACTORING.md の S3・D4）---

/** サーバーが作る発言だけが使う名前（入退室の管理人、おみくじの巫女、triage の返信） */
export const RESERVED_NAMES: readonly string[] = ['管理人', '巫女'];

/**
 * 予約名か。NFKC に正規化し（全角・半角・互換文字の揺れを畳む）、空白と見えない文字（ゼロ幅スペース・
 * ゼロ幅接合子・Word Joiner など Default_Ignorable_Code_Point）をすべて除いてから比べる。
 * 例: 「管 理 人」「 巫女 」「管理⼈」（康熙部首）「管\u200B理人」も予約名
 */
export function isReservedName(name: string): boolean {
  const folded = name.normalize('NFKC').replace(/[\s\p{Default_Ignorable_Code_Point}]+/gu, '');
  return RESERVED_NAMES.includes(folded);
}

/**
 * 名前・発言・色・メールを確かめる。room_id は別（rooms 表の外部キーで確かめる）。
 * 型が違う・空のものは呼び出し側が先に弾いている前提で、ここでは上限と形式を見る。色は拒否せず、
 * 読めなければ DEFAULT_COLOR にする（どのクライアントでも同じ色になる）
 */
export function checkSayInput(input: {
  name: string;
  message: string;
  color: unknown;
  email: unknown;
}): InputCheck {
  const nameError = checkName(input.name);
  if (nameError) return nameError;

  if (input.message.trim().length === 0) {
    return { error: 'invalid_message', violation: 'message_blank' };
  }
  if (
    countGraphemes(input.message) > MESSAGE_MAX ||
    countCodePoints(input.message) > MESSAGE_MAX_CODE_POINTS
  ) {
    return { error: 'invalid_message', violation: 'message_too_long' };
  }

  let email: string | null = null;
  if (typeof input.email === 'string') {
    if (countCodePoints(input.email) > EMAIL_MAX) {
      return { error: 'invalid_email', violation: 'email_too_long' };
    }
    if (hasControlChars(input.email)) {
      return { error: 'invalid_email', violation: 'email_control_chars' };
    }
    email = input.email;
  } else if (input.email != null) {
    return { error: 'invalid_email', violation: 'email_not_string' };
  }

  return {
    error: null,
    value: {
      name: input.name.trim(),
      message: input.message,
      color: normalizeColor(input.color) ?? DEFAULT_COLOR,
      email,
    },
  };
}

/** 端末の中の数（訪問回数・前回のログインなど）を 0〜max の整数に丸める。数でなければ undefined */
export function clampInt(value: unknown, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}

/** 楽観的な行と突き合わせる nonce（OPTIMISTIC_NONCE_MAX コードポイント以内の文字列）。違えば undefined */
export function readNonce(value: unknown): string | undefined {
  return typeof value === 'string' && countCodePoints(value) <= OPTIMISTIC_NONCE_MAX
    ? value
    : undefined;
}

// --- metadata（Issue #177、docs/SERVER_SIDE_LOGIC_REFACTORING.md の S2）---
//
// save-chat は利用者の発言の metadata をこの許可リストで作り直してから保存する。知らないキーと範囲外の値は落とす。
// 拒否はしない（落とした内容は記録する）。kind・userColor・visitCount・lastLogin・event・subject はサーバーが作る
// 発言（入退室・おみくじ。messages.ts）だけが持ち、利用者の発言では受け付けない。
// Web の normalizeChatMetadata も同じ一覧で、保存済みの行（サーバーが作った行を含む）を読む。

export const FONT_SIZES = [1, 2, 3, 4, 5] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** 文字の色（ChatRoom の選択肢） */
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

/** キャラアイコン。'none' は「付けない」で、metadata には保存しない */
export const AVATAR_IDS = [
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
export type AvatarId = (typeof AVATAR_IDS)[number];

export const METADATA_KINDS = ['normal', 'fortune', 'admin'] as const;
export type MetadataKind = (typeof METADATA_KINDS)[number];

export const OPTIMISTIC_NONCE_MAX = 64;
export const VISIT_COUNT_MAX = 1_000_000;
/** metadata の JSON の上限（DB の CHECK 制約 chats_metadata_check と同じ値。作り直した値は必ず収まる） */
export const METADATA_MAX_BYTES = 2048;
/** 落としたものの記録の件数と 1 件の長さの上限（超えた分は 'truncated' 1 件にまとめる） */
export const METADATA_DROPPED_MAX = 20;
export const METADATA_DROPPED_ENTRY_MAX = 64;

/** 利用者の発言の metadata（サーバーが作る発言の形は messages.ts） */
export interface ChatMetadataShape {
  version: 1;
  fontStyle?: { fontSize?: FontSize; fontColor?: FontColorName; bold?: boolean };
  avatar?: Exclude<AvatarId, 'none'>;
  optimisticNonce?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includes<T extends string | number>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}

export interface MetadataCheck {
  /** 保存する metadata。元が無い・読めないときは null */
  value: ChatMetadataShape | null;
  /** 落としたキー・値（記録用）。例: `unknown:foo`、`fontStyle.fontSize` */
  dropped: string[];
}

/** 利用者の発言の metadata を許可リストで作り直す */
export function sanitizeMetadata(input: unknown): MetadataCheck {
  // 記録は件数と長さに上限を付ける（未知のキーの数と長さはクライアントが決められるため）
  const dropped: string[] = [];
  let truncated = false;
  const drop = (entry: string) => {
    if (dropped.length < METADATA_DROPPED_MAX)
      dropped.push(entry.slice(0, METADATA_DROPPED_ENTRY_MAX));
    else truncated = true;
  };
  if (input === null || input === undefined) return { value: null, dropped };
  if (!isRecord(input)) return { value: null, dropped: ['not_object'] };
  if (input.version !== 1) return { value: null, dropped: ['version'] };

  const value: ChatMetadataShape = { version: 1 };
  const known = new Set(['version', 'fontStyle', 'avatar', 'optimisticNonce']);
  for (const key of Object.keys(input)) if (!known.has(key)) drop(`unknown:${key}`);

  if (input.fontStyle !== undefined) {
    if (isRecord(input.fontStyle)) {
      const style = input.fontStyle;
      const fontStyle: NonNullable<ChatMetadataShape['fontStyle']> = {};
      for (const key of Object.keys(style)) {
        if (key !== 'fontSize' && key !== 'fontColor' && key !== 'bold') {
          drop(`unknown:fontStyle.${key}`);
        }
      }
      if (includes(FONT_SIZES, style.fontSize)) fontStyle.fontSize = style.fontSize;
      else if (style.fontSize !== undefined) drop('fontStyle.fontSize');
      if (includes(FONT_COLOR_NAMES, style.fontColor)) fontStyle.fontColor = style.fontColor;
      else if (style.fontColor !== undefined) drop('fontStyle.fontColor');
      if (typeof style.bold === 'boolean') fontStyle.bold = style.bold;
      else if (style.bold !== undefined) drop('fontStyle.bold');
      if (Object.keys(fontStyle).length > 0) value.fontStyle = fontStyle;
    } else {
      drop('fontStyle');
    }
  }

  if (includes(AVATAR_IDS, input.avatar) && input.avatar !== 'none') value.avatar = input.avatar;
  else if (input.avatar !== undefined && input.avatar !== 'none') drop('avatar');

  const nonce = readNonce(input.optimisticNonce);
  if (nonce !== undefined) value.optimisticNonce = nonce;
  else if (input.optimisticNonce !== undefined) drop('optimisticNonce');

  if (truncated) dropped.push('truncated');
  return { value, dropped };
}
