// URL自動リンク化モジュール
// メッセージ内のURLを検出し、構造化されたセグメントとして返す

export type MessageSegment = { type: 'text'; content: string } | { type: 'url'; href: string };

// 日本語句読点・閉じ括弧（URL末尾から分離する文字）
const TRAILING_JP_PUNCT = /[。、）】」』]+$/;

// URL検出正規表現: http:// または https:// で始まるURLを大まかに検出
// スペース、<、>、"、' で区切る
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/**
 * URL末尾の日本語句読点・閉じ括弧をトリムする。
 * トリムした文字列と残りの末尾テキストを返す。
 */
function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  const match = url.match(TRAILING_JP_PUNCT);
  if (match) {
    const trailing = match[0];
    return { href: url.slice(0, -trailing.length), trailing };
  }
  return { href: url, trailing: '' };
}

/**
 * メッセージ文字列をテキストセグメントとURLセグメントに分割する。
 *
 * - `http://` と `https://` のみ許可（`javascript:` スキームはリンク化しない）
 * - URL末尾の日本語句読点（。、）】」』）をURLから分離
 * - すべてのセグメントのコンテンツを結合すると元のメッセージと一致する（ラウンドトリップ）
 */
export function parseMessageSegments(message: string): MessageSegment[] {
  if (!message) {
    return [{ type: 'text', content: '' }];
  }

  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  // グローバル正規表現のlastIndexをリセット
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(message)) !== null) {
    const matchStart = match.index;
    const rawUrl = match[0];

    // マッチ前のテキストをテキストセグメントとして追加
    if (matchStart > lastIndex) {
      segments.push({ type: 'text', content: message.slice(lastIndex, matchStart) });
    }

    // URL末尾の日本語句読点をトリム
    const { href, trailing } = trimTrailingPunctuation(rawUrl);

    // URLセグメントを追加
    segments.push({ type: 'url', href });

    // トリムした句読点があればテキストセグメントとして追加
    if (trailing) {
      segments.push({ type: 'text', content: trailing });
    }

    lastIndex = matchStart + rawUrl.length;
  }

  // 残りのテキストをテキストセグメントとして追加
  if (lastIndex < message.length) {
    segments.push({ type: 'text', content: message.slice(lastIndex) });
  }

  // セグメントが空の場合（メッセージが空文字列でない限り到達しないが安全策）
  if (segments.length === 0) {
    return [{ type: 'text', content: message }];
  }

  return segments;
}
