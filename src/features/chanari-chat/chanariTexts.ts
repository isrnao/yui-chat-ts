import { EFFECT_OPTIONS } from './utils/effectOptions';
import { FONT_SIZE_OPTIONS } from './utils/fontSizeOptions';
import { DEFAULT_RELOAD_SECONDS, RELOAD_SECONDS_OPTIONS } from './utils/draftStore';

/**
 * ちゃなりの画面の決まった文言と選択肢（Android 版も同じものを出す。contracts の chanari.json に書き出す）。
 */
export const CHANARI_TEXTS = {
  backToTop: 'お気楽チャットトップへ',
  backToNarikiri: 'なりきりチャットにもどる',
  help: 'ヘルプ',
  slogan: 'ヽ(。д。)ﾉ常連さん募集中～！',
  titleSuffix: '（なりきり）',
  name: 'おなまえ',
  nameColor: '名前色',
  speechColor: '発言色',
  nameColorPicker: '名前色ピッカー',
  speechColorPicker: '発言色ピッカー',
  enter: 'チャットに参加する',
  reloadSeconds: 'リロード秒',
  effect: 'エフェクト',
  fontSize: '文字サイズ',
  disableEffect: 'エフェクト無効',
  message: '発言',
  charCount: '文字',
  overLimit: '文字数オーバー',
  send: 'チャットで発言する',
  reload: '更新',
  restore: '発言復元',
  clearLogs: 'ログ消去',
  clearFailed: 'ログを消去できませんでした。時間をおいてもう一度お試しください。',
  atField: 'AT フィールド',
  exit: 'チャットから退室する',
} as const;

/** 選択肢（エフェクトと文字サイズは選べるだけで、まだ表示に反映しない） */
export const CHANARI_OPTIONS = {
  effects: EFFECT_OPTIONS.map(({ id, label }) => ({ id, label })),
  fontSizes: FONT_SIZE_OPTIONS.map(({ id, label }) => ({ id, label })),
  reloadSeconds: [...RELOAD_SECONDS_OPTIONS],
  defaultReloadSeconds: DEFAULT_RELOAD_SECONDS,
};
