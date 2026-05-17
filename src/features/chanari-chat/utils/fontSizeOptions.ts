// select の `<option>` 描画用の定数のみ。将来 CSS 変換が必要になった時点で関数を追加する。

export const FONT_SIZE_OPTIONS = [
  { id: 'default', label: '文字サイズ' },
  // 絶対サイズ（px）
  { id: 'px-6', label: '6px', px: 6 },
  { id: 'px-7', label: '7px', px: 7 },
  { id: 'px-8', label: '8px', px: 8 },
  { id: 'px-9', label: '9px', px: 9 },
  { id: 'px-10', label: '10px', px: 10 },
  { id: 'px-11', label: '11px', px: 11 },
  { id: 'px-12', label: '12px', px: 12 },
  { id: 'px-13', label: '13px', px: 13 },
  { id: 'px-14', label: '14px', px: 14 },
  { id: 'px-15', label: '15px', px: 15 },
  // 相対倍率
  { id: 'x0_6', label: 'x0.6', scale: 0.6 },
  { id: 'x0_7', label: 'x0.7', scale: 0.7 },
  { id: 'x0_8', label: 'x0.8', scale: 0.8 },
  { id: 'x0_9', label: 'x0.9', scale: 0.9 },
  { id: 'x1_0', label: 'x1.0', scale: 1.0 },
  { id: 'x1_1', label: 'x1.1', scale: 1.1 },
  { id: 'x1_2', label: 'x1.2', scale: 1.2 },
  { id: 'x1_3', label: 'x1.3', scale: 1.3 },
  { id: 'x1_4', label: 'x1.4', scale: 1.4 },
  { id: 'x1_5', label: 'x1.5', scale: 1.5 },
] as const;

export type LegacyFontSize = (typeof FONT_SIZE_OPTIONS)[number]['id'];
