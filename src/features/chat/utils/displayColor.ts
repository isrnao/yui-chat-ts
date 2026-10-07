/**
 * 楽観的な表示に使う色。save-chat の normalizeColor と同じく `#rgb`・`#rrggbb`・CSS の色名を小文字にし、
 * それ以外は null にする。色名はブラウザの CSS.supports で確かめ、色名の一覧（schema.ts の CSS_COLOR_NAME_LIST）を
 * 画面の bundle に載せない。確定する色はサーバーの応答の color で上書きされるので、ここは表示の目安でよい
 */
export function normalizeDisplayColor(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) return value;
  if (!/^[a-z]+$/.test(value) || value === 'transparent' || value === 'currentcolor') return null;
  return typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('color', value)
    ? value
    : null;
}
