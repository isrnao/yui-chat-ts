/**
 * 色コード正規化ユーティリティ
 *
 * カラーピッカーやテキスト入力から受け取った色文字列を
 * `#rrggbb` 形式（7 文字、小文字）に正規化する純関数。
 */

/** CSS 名前付き色 → #rrggbb マッピング（最低限のサブセット） */
export const CSS_NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  hotpink: '#ff69b4',
  pink: '#ffc0cb',
  orange: '#ffa500',
  yellow: '#ffff00',
  aqua: '#00ffff',
  purple: '#800080',
  lime: '#00ff00',
  navy: '#000080',
  teal: '#008080',
  gray: '#808080',
};

/**
 * 色文字列を `#rrggbb` 形式に正規化する。
 *
 * - `#rgb` → `#rrggbb` 展開
 * - `#rrggbb` → そのまま（小文字化）
 * - 名前付き色 → `#rrggbb` に変換
 * - 不正値 → `fallback` を返す
 *
 * 戻り値は必ず `/^#[0-9a-f]{6}$/` にマッチする。
 * 副作用なし。
 */
export function normalizeColorCode(input: string, fallback: string = '#000000'): string {
  const trimmed = input.trim().toLowerCase();

  // 名前付き色を先にチェック
  if (CSS_NAMED_COLORS[trimmed]) {
    return CSS_NAMED_COLORS[trimmed];
  }

  // #rgb 形式（3 桁）
  const shortMatch = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (shortMatch) {
    return `#${shortMatch[1]}${shortMatch[1]}${shortMatch[2]}${shortMatch[2]}${shortMatch[3]}${shortMatch[3]}`;
  }

  // #rrggbb 形式（6 桁）
  const longMatch = trimmed.match(/^#[0-9a-f]{6}$/);
  if (longMatch) {
    return trimmed;
  }

  // 不正値 → fallback（fallback 自体も正規化して安全を保証）
  const normalizedFallback = fallback.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalizedFallback)) {
    return normalizedFallback;
  }

  // fallback すら不正な場合は最終手段として #000000
  return '#000000';
}
