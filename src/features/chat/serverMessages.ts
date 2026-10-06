// サーバーが作る発言（入退室の管理人・おみくじの巫女）。正は save-chat の messages.ts（サーバーが保存する内容）で、
// 画面は楽観的な表示とコマンドの判定にだけ使う。依存の無いファイルなので、ツーショットの rules.ts と同じく相対パスで読む。
export {
  ADMIN_FALLBACK_USER_COLOR,
  ADMIN_NAME,
  buildAdminChat,
  enterMessage,
  exitMessage,
  isFortuneCommand,
  type AdminChatInput,
  type AdminEvent,
} from '../../../supabase/functions/save-chat/messages.ts';
