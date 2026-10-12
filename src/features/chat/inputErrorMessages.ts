import { EMAIL_MAX, MESSAGE_MAX, NAME_MAX, type InputErrorCode } from './inputRules';

/**
 * save-chat が入力の誤りで拒否したときのコード（`{ "error": { "code": "invalid_name" } }`）と、画面に出す文言。
 * 文言はクライアントが選ぶ（サーバーはコードだけを返す）。Android 版も contracts/chat-options.json で同じ文言を使う。
 */
export const INPUT_ERROR_MESSAGES: Record<InputErrorCode, string> = {
  invalid_room_id: 'この部屋には発言できません。',
  invalid_name: `おなまえを確かめてください（${NAME_MAX}文字以内）。`,
  reserved_name: 'その名前は使えません。',
  invalid_message: `発言を確かめてください（${MESSAGE_MAX}文字以内）。`,
  invalid_email: `E-Mail/URLを確かめてください（${EMAIL_MAX}文字以内）。`,
};
