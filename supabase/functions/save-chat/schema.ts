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
  else if (messageLength > MESSAGE_MAX) reject('invalid_message', 'message_too_long');

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
