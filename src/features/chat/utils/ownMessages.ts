import type { Chat } from '../types';

/**
 * このタブが送った発言の nonce（optimisticNonce）を覚えておく。Realtime で届いた INSERT が自分の発言の
 * echo かを見分けるのに使う（look / unlook の通知音で、自分の発言で二重に鳴らさないため。Issue #184）。
 *
 * echo は保存の応答より先に届くことがあるので、送る前に覚える。古いものから捨てる。
 */
const MAX_REMEMBERED = 100;
const ownNonces = new Set<string>();

export function rememberOwnChat(chat: Pick<Chat, 'metadata'>): void {
  const nonce = chat.metadata?.optimisticNonce;
  if (!nonce) return;
  ownNonces.add(nonce);
  if (ownNonces.size > MAX_REMEMBERED) {
    const oldest = ownNonces.values().next().value;
    if (oldest !== undefined) ownNonces.delete(oldest);
  }
}

export function isOwnChat(chat: Pick<Chat, 'metadata'>): boolean {
  const nonce = chat.metadata?.optimisticNonce;
  return nonce !== undefined && ownNonces.has(nonce);
}

/** テスト用 */
export function forgetOwnChatsForTest(): void {
  ownNonces.clear();
}
