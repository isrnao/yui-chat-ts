// 発言の入力の規則。正は save-chat の schema.ts（サーバーが確かめる値）で、画面はそれを使う。
// 依存の無いファイルなので、ツーショットの rules.ts と同じく相対パスで読む。
export {
  AVATAR_IDS,
  DEFAULT_COLOR,
  EMAIL_MAX,
  FONT_COLOR_NAMES,
  FONT_SIZES,
  isReservedName,
  MESSAGE_MAX,
  METADATA_KINDS,
  NAME_MAX,
  normalizeColor,
  OPTIMISTIC_NONCE_MAX,
  type AvatarId,
  type FontColorName,
  type FontSize,
  type InputErrorCode,
  type MetadataKind,
} from '../../../supabase/functions/save-chat/schema.ts';
