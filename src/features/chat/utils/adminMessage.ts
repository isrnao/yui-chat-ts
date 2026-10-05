/**
 * レガシーの管理人メッセージから「ユーザー名」部分を抽出する。
 * 例: "薄ら紅 さん、Welcome to お気楽チャット☆" → { userName: '薄ら紅', rest: 'さん、Welcome to...' }
 * 例: "薄ら紅さん、またきておくれやすぅ。" → { userName: '薄ら紅', rest: 'さん、...' }
 */
export function splitAdminMessage(message: string): { userName: string; rest: string } | null {
  const match = message.match(/^(.+?)\s?(さん[、,].+)$/);
  if (!match) return null;
  return { userName: match[1].trim(), rest: match[2] };
}
