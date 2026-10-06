// 発言の入力の規則（上限と形式）。save-chat が確かめ、Web は同じ値を相対パスで import する
// （ツーショットの rules.ts と同じ形）。docs/SERVER_SIDE_LOGIC_REFACTORING.md の S1（Issue #176）。
//
// import を持たない。Deno（Edge Function）と Vitest（Web）の両方から読むため。
//
// 上限は画面より緩いか同じにして、画面を正しく使う人が拒否されないようにする。
// - 画面の maxLength は UTF-16 の単位で数える。ここはコードポイント（名前）・grapheme（発言）で
//   数えるので、同じ数でも画面より緩い
// - DB の CHECK 制約（20261006000000_chats_input_checks.sql）はさらに緩い最後の防壁

export const NAME_MAX = 24;
export const MESSAGE_MAX = 120;
/**
 * 発言のコードポイントの上限（DB の CHECK 制約 chats_message_check と同じ値）。120 grapheme でも、結合文字を
 * 大量に重ねた 1 grapheme はこれを超えうる。ここで拒否しないと enforce でも通って DB で 500 になる
 */
export const MESSAGE_MAX_CODE_POINTS = 2000;
export const EMAIL_MAX = 64;
/** 色が読めないときに保存する色。EntryForm の既定の色と同じ */
export const DEFAULT_COLOR = '#ff69b4';

/** 入力の検証で返すエラーのコード。画面の文言はクライアントがこのコードから選ぶ */
export type InputErrorCode =
  | 'invalid_room_id'
  | 'invalid_name'
  | 'invalid_message'
  | 'invalid_email';

// --- 文字数 ---

type Segmenter = { segment(input: string): Iterable<unknown> };
type SegmenterConstructor = new (
  locale?: string,
  options?: { granularity: 'grapheme' }
) => Segmenter;

/** コードポイントの数（サロゲートペアを 1 文字と数える） */
export function countCodePoints(input: string): number {
  let count = 0;
  for (const _ of input) count++;
  return count;
}

/**
 * grapheme（見た目の 1 文字）の数。ちゃなりの countChars と同じ数え方。
 * Intl.Segmenter が無い環境ではコードポイントで数える（grapheme より多く数えるので、緩くはならない）。
 */
export function countGraphemes(input: string): number {
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (typeof Ctor !== 'function') return countCodePoints(input);
  let count = 0;
  for (const _ of new Ctor(undefined, { granularity: 'grapheme' }).segment(input)) count++;
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
// 画面の bundle には要らないので、使われなければ捨てられるようにする
export const CSS_COLOR_NAMES: ReadonlySet<string> = /* @__PURE__ */ new Set(
  `
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
  `
    .trim()
    .split(/\s+/)
);

/**
 * 色を保存する形にする。`#rgb`・`#rrggbb`・CSS の色名なら前後の空白を除いて小文字にして返し、
 * それ以外は null（呼び出し側が DEFAULT_COLOR に置き換える）。
 */
export function normalizeColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) return value;
  return CSS_COLOR_NAMES.has(value) ? value : null;
}

// --- 発言の入力 ---

export interface SayInput {
  name: string;
  message: string;
  color: string;
  email: string | null;
}

export interface InputCheck {
  /** 拒否するときのコード（最初の 1 つ）。null なら受け付けてよい */
  error: InputErrorCode | null;
  /** 違反の一覧（記録用。拒否しない違反も含む） */
  violations: string[];
  /** 規則に合わせた値（色は読めなければ DEFAULT_COLOR） */
  value: SayInput;
}

/**
 * 名前・発言・色・メールを確かめる。room_id は別（rooms 表で確かめる）。
 * 型が違う・空のものは呼び出し側が先に弾いている前提で、ここでは上限と形式を見る。
 */
export function checkSayInput(input: {
  name: string;
  message: string;
  color: unknown;
  email: unknown;
}): InputCheck {
  const violations: string[] = [];
  let error: InputErrorCode | null = null;
  const reject = (code: InputErrorCode, detail: string) => {
    violations.push(detail);
    error ??= code;
  };

  const nameLength = countCodePoints(input.name.trim());
  if (nameLength === 0) reject('invalid_name', 'name_blank');
  else if (nameLength > NAME_MAX) reject('invalid_name', 'name_too_long');

  const messageLength = countGraphemes(input.message);
  if (input.message.trim().length === 0) reject('invalid_message', 'message_blank');
  else if (
    messageLength > MESSAGE_MAX ||
    countCodePoints(input.message) > MESSAGE_MAX_CODE_POINTS
  ) {
    reject('invalid_message', 'message_too_long');
  }

  let email: string | null = null;
  if (typeof input.email === 'string') {
    email = input.email;
    if (countCodePoints(email) > EMAIL_MAX) reject('invalid_email', 'email_too_long');
    if (hasControlChars(email)) reject('invalid_email', 'email_control_chars');
  } else if (input.email != null) {
    reject('invalid_email', 'email_not_string');
  }

  // 色は拒否しない。読めない色は既定の色にする（どのクライアントでも同じ色になる）
  let color = normalizeColor(input.color);
  if (color === null) {
    violations.push('color_replaced');
    color = DEFAULT_COLOR;
  }

  return { error, violations, value: { name: input.name, message: input.message, color, email } };
}

// --- metadata（Issue #177、docs/SERVER_SIDE_LOGIC_REFACTORING.md の S2）---
//
// save-chat は受け取った metadata をこの許可リストで作り直してから保存する。知らないキーと範囲外の値は落とす。
// 拒否はしない（落とした内容は記録する）。Web の normalizeChatMetadata も同じ一覧を使う。

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
/** 作り直した metadata の JSON の上限（DB の CHECK 制約 chats_metadata_check と同じ値） */
export const METADATA_MAX_BYTES = 2048;

export interface ChatMetadataShape {
  version: 1;
  fontStyle?: { fontSize?: FontSize; fontColor?: FontColorName; bold?: boolean };
  avatar?: Exclude<AvatarId, 'none'>;
  kind?: MetadataKind;
  userColor?: string;
  visitCount?: number;
  lastLogin?: number;
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

/**
 * metadata を許可リストで作り直す。`now` は lastLogin の上限（ミリ秒）。
 *
 * 今の Web は入退室・おみくじで kind・userColor・visitCount・lastLogin を自分で付けて送っているので、
 * 1 段階目ではこれらも受け付ける（2 段階目で、サーバーが作る発言だけに限る）。
 */
export function sanitizeMetadata(input: unknown, now: number): MetadataCheck {
  const dropped: string[] = [];
  if (input === null || input === undefined) return { value: null, dropped };
  if (!isRecord(input)) return { value: null, dropped: ['not_object'] };
  if (input.version !== 1) return { value: null, dropped: ['version'] };

  const value: ChatMetadataShape = { version: 1 };
  const known = new Set([
    'version',
    'fontStyle',
    'avatar',
    'kind',
    'userColor',
    'visitCount',
    'lastLogin',
    'optimisticNonce',
  ]);
  for (const key of Object.keys(input)) if (!known.has(key)) dropped.push(`unknown:${key}`);

  if (input.fontStyle !== undefined) {
    if (isRecord(input.fontStyle)) {
      const style = input.fontStyle;
      const fontStyle: NonNullable<ChatMetadataShape['fontStyle']> = {};
      for (const key of Object.keys(style)) {
        if (key !== 'fontSize' && key !== 'fontColor' && key !== 'bold') {
          dropped.push(`unknown:fontStyle.${key}`);
        }
      }
      if (includes(FONT_SIZES, style.fontSize)) fontStyle.fontSize = style.fontSize;
      else if (style.fontSize !== undefined) dropped.push('fontStyle.fontSize');
      if (includes(FONT_COLOR_NAMES, style.fontColor)) fontStyle.fontColor = style.fontColor;
      else if (style.fontColor !== undefined) dropped.push('fontStyle.fontColor');
      if (typeof style.bold === 'boolean') fontStyle.bold = style.bold;
      else if (style.bold !== undefined) dropped.push('fontStyle.bold');
      if (Object.keys(fontStyle).length > 0) value.fontStyle = fontStyle;
    } else {
      dropped.push('fontStyle');
    }
  }

  if (includes(AVATAR_IDS, input.avatar) && input.avatar !== 'none') value.avatar = input.avatar;
  else if (input.avatar !== undefined && input.avatar !== 'none') dropped.push('avatar');

  if (includes(METADATA_KINDS, input.kind)) value.kind = input.kind;
  else if (input.kind !== undefined) dropped.push('kind');

  if (input.userColor !== undefined) {
    const color = normalizeColor(input.userColor);
    if (color) value.userColor = color;
    else dropped.push('userColor');
  }

  // 端末の中の値なので、範囲に丸めるだけ
  if (typeof input.visitCount === 'number' && Number.isFinite(input.visitCount)) {
    value.visitCount = Math.min(Math.max(Math.trunc(input.visitCount), 0), VISIT_COUNT_MAX);
  } else if (input.visitCount !== undefined) {
    dropped.push('visitCount');
  }
  if (typeof input.lastLogin === 'number' && Number.isFinite(input.lastLogin)) {
    value.lastLogin = Math.min(Math.max(Math.trunc(input.lastLogin), 0), now);
  } else if (input.lastLogin !== undefined) {
    dropped.push('lastLogin');
  }

  if (
    typeof input.optimisticNonce === 'string' &&
    countCodePoints(input.optimisticNonce) <= OPTIMISTIC_NONCE_MAX
  ) {
    value.optimisticNonce = input.optimisticNonce;
  } else if (input.optimisticNonce !== undefined) {
    dropped.push('optimisticNonce');
  }

  return { value, dropped };
}
