// select の `<option>` 描画用の定数のみ。将来 CSS 変換が必要になった時点で関数を追加する。

export const EFFECT_OPTIONS = [
  { id: 'none', label: 'エフェクトの選択' },
  { id: 'bg-black', label: '黒背景' },
  { id: 'bg-white', label: '白背景' },
  { id: 'bg-orange', label: '橙背景' },
  { id: 'bg-yellow', label: '黄背景' },
  { id: 'bg-green', label: '緑背景' },
  { id: 'bg-aqua', label: '水背景' },
  { id: 'bg-blue', label: '青背景' },
  { id: 'bg-purple', label: '紫背景' },
  { id: 'bg-pink', label: '桃背景' },
  { id: 'grad-white-pink', label: 'グラデ白〜桃' },
  { id: 'shadow-gray-1', label: '影1(灰)' },
  { id: 'shadow-gray-2', label: '影2(灰)' },
  { id: 'flip-h', label: '左右反転' },
  { id: 'flip-v', label: '上下反転' },
  { id: 'wave-slow', label: 'WAVE(緩)' },
  { id: 'wave-mid', label: 'WAVE(中)' },
  { id: 'wave-fast', label: 'WAVE(激)' },
  { id: 'wave-dirty', label: 'WAVE(汚)' },
  { id: 'blur-soft', label: 'BLUR(陰影)' },
  { id: 'blur-haze', label: 'BLUR(霞)' },
  { id: 'x-ray', label: 'X-線(謎)' },
  { id: 'mask', label: 'マスク' },
  { id: 'invert', label: '色反転' },
  { id: 'mosaic', label: 'モザイク' },
  { id: 'emboss', label: '凸' },
  { id: 'intaglio', label: '凹' },
] as const;

export type EffectId = (typeof EFFECT_OPTIONS)[number]['id'];
