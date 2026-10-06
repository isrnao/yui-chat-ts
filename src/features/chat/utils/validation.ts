import { NAME_MAX } from '../inputRules';

// 名前バリデーション（チャット機能専用）。上限は save-chat と同じ値（schema.ts）を使う。
// 画面は UTF-16 の単位で数えるので、コードポイントで数えるサーバーより厳しい（画面を通れば拒否されない）
export function validateName(name: string): string | null {
  if (!name.trim()) return 'おなまえは必須です';
  if (name.length > NAME_MAX) return `おなまえは${NAME_MAX}文字以内`;
  return null;
}
