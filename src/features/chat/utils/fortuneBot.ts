// おみくじ機能（Fortune Bot）
// 「おみくじ」メッセージに対してランダムな運勢メッセージを返すクライアントサイドボット

export type FortuneResult = {
  message: string;
  senderName: '巫女';
  color: 'hotpink';
};

/**
 * オリジナルCGIチャット（YuiChat-Pro kuji.dat）由来の運勢メッセージリスト。
 * Shift-JISからデコードした原文をそのまま使用。
 */
export const FORTUNE_MESSAGES: readonly string[] = [
  '大吉で〜す。うまい話が転がり込んできます。仕事は早目に片付けて出かけましょう。',
  '凶で〜す。邁進せずに内を固める必要があるようです..。自己過信すると道を間違えるわね..。',
  '大吉で〜す。任されたら責任持って進むのがいいです。不慣れな事柄なら携わらぬようにね。',
  '中吉で〜す。一気に攻めると挫折しやすいです。計画をきちんと立てて前進しませう。',
  '中吉で〜す。不満な所は素直に言うべきです。環境改善がツキの流れを良くするわ..。',
  '大凶で〜す。人間関係に歪みを出さないのがいいです。感情に触るような言葉はさけましょう。',
  '中吉で〜す。理屈通そうとすると無理があるようです..。その場に合わせた判断すればよいでしょう。',
  '凶で〜す。我欲にとらわれると失敗するわね..。周りのために働くことを考えてくださいね。',
  '凶で〜す。口先だけの約束をすると大失点。信用がなければ仕事も来ない。',
  '大吉で〜す。上司を頼りにすれば喜ばれるわね..。大いに利用して事を進めるべきです。',
  '凶で〜す。甘い誘いにフラフラしないのがいいです。自ら危険なワナにはまりやすいです。',
  '大吉で〜す。情報の聞き漏らしないか確認しませう。普段より順調に運び一段落します。',
] as const;

/**
 * メッセージがおみくじコマンドかどうかを判定する。
 * 前後の空白を許容し、`おみくじ` と完全一致する場合のみ true を返す。
 */
export function isFortuneCommand(message: string): boolean {
  return message.trim() === 'おみくじ';
}

/**
 * ランダムな運勢メッセージを生成する。
 * 形式: `{運勢メッセージ}＞{userName}さん`
 */
export function generateFortune(userName: string): FortuneResult {
  const index = Math.floor(Math.random() * FORTUNE_MESSAGES.length);
  const fortuneMessage = FORTUNE_MESSAGES[index];

  return {
    message: `${fortuneMessage}＞${userName}さん`,
    senderName: '巫女',
    color: 'hotpink',
  };
}
