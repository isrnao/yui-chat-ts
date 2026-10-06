// サーバーが作る発言（入退室の管理人）の文言と形。save-chat が保存する内容の正で、Web は楽観的な表示にだけ
// 同じ関数を使う（docs/SERVER_SIDE_LOGIC_REFACTORING.md の S5、Issue #180）。
//
// import を持たない。Deno（Edge Function）と Vitest（Web）の両方から読むため。
// 文言を変えると参加者一覧（useParticipants の正規表現）と表示（splitAdminMessage）が古い行を読めなくなるので、
// 変えるときは metadata の構造（Issue #183）で読む形になってから行う。

export const ADMIN_NAME = '管理人';
export const ADMIN_COLOR = '#ffffff';
export const ADMIN_AVATAR = 'hoshi1';
/** userColor が読めないときの色（ChatMessage が userColor の無い管理人の発言に使う色と同じ） */
export const ADMIN_FALLBACK_USER_COLOR = '#ff69b4';

export type AdminEvent = 'enter' | 'exit';

export function enterMessage(name: string): string {
  return `${name} さん、Welcome to お気楽チャット☆`;
}

export function exitMessage(name: string): string {
  return `${name}さん、またきておくれやすぅ。`;
}

export interface AdminChatInput {
  event: AdminEvent;
  /** 入退室した人の名前と色 */
  name: string;
  color: string;
  /** 入室だけ: 訪問回数と前回のログイン（端末の中の値。サーバーは範囲に丸めてから渡す） */
  visitCount?: number;
  lastLogin?: number;
  /** 楽観的な行と突き合わせるための nonce */
  nonce?: string;
}

export interface AdminChat {
  name: string;
  color: string;
  message: string;
  system: true;
  metadata: {
    version: 1;
    avatar: typeof ADMIN_AVATAR;
    kind: 'admin';
    userColor: string;
    fontStyle: { bold: true };
    visitCount?: number;
    lastLogin?: number;
    optimisticNonce?: string;
  };
}

/** 入退室の管理人の発言。以前の Web（useChatSession + createAdminChat）が作っていたものと同じ */
export function buildAdminChat(input: AdminChatInput): AdminChat {
  const metadata: AdminChat['metadata'] = {
    version: 1,
    avatar: ADMIN_AVATAR,
    kind: 'admin',
    userColor: input.color,
    fontStyle: { bold: true },
  };
  if (input.event === 'enter') {
    if (input.visitCount !== undefined) metadata.visitCount = input.visitCount;
    if (input.lastLogin !== undefined) metadata.lastLogin = input.lastLogin;
  }
  if (input.nonce !== undefined) metadata.optimisticNonce = input.nonce;
  return {
    name: ADMIN_NAME,
    color: ADMIN_COLOR,
    message: input.event === 'enter' ? enterMessage(input.name) : exitMessage(input.name),
    system: true,
    metadata,
  };
}
