// 発言の入力の規則。正は save-chat の schema.ts（サーバーが確かめる値）で、画面はそれを使う。
// 依存の無いファイルなので、ツーショットの rules.ts と同じく相対パスで読む。
export {
  DEFAULT_COLOR,
  EMAIL_MAX,
  MESSAGE_MAX,
  NAME_MAX,
  type InputErrorCode,
} from '../../../supabase/functions/save-chat/schema.ts';
