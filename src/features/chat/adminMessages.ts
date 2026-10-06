// 入退室の管理人の発言。正は save-chat の messages.ts（サーバーが保存する内容）で、画面は楽観的な表示にだけ使う。
// 依存の無いファイルなので、ツーショットの rules.ts と同じく相対パスで読む。
export {
  ADMIN_FALLBACK_USER_COLOR,
  ADMIN_NAME,
  buildAdminChat,
  enterMessage,
  exitMessage,
  type AdminChatInput,
  type AdminEvent,
} from '../../../supabase/functions/save-chat/messages.ts';
