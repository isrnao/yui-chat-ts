import { createPersistentStore } from '@shared/utils/persistentStore';
import { isRoomId, isSex, type Sex } from '../../../../supabase/functions/two-shot/rules.ts';
import type { EnterRequest } from '../protocol';

/**
 * このタブの Session（sessionStorage）。spec: design.md §8「Session と入室試行」
 *
 * - pending: 入室要求を送る前に、トークンと要求を保存した状態。応答を受け取れなくても同じ試行を再送できる
 * - active: サーバーが入室を確定した状態。me は表示専用で、認可には使わない（認可はトークンと席）
 *
 * 別のタブは別の Session（sessionStorage はタブごと）。保存できない環境ではメモリ上の値で動く
 * （そのページの中では使えるが、再読み込みからの復元はできない）。
 */
export type PendingSession = { status: 'pending'; token: string; request: EnterRequest };
export type ActiveSession = {
  status: 'active';
  token: string;
  roomId: string;
  seat: 0 | 1;
  me: { name: string; sex: Sex };
};
export type TwoShotSession = PendingSession | ActiveSession;

const TOKEN = /^v1\.\d{1,15}\.[A-Za-z0-9_-]{43}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequest(value: unknown): EnterRequest | null {
  if (!isObject(value)) return null;
  const { room, name, sex, profile, make } = value;
  if (
    !isRoomId(room) ||
    typeof name !== 'string' ||
    !isSex(sex) ||
    typeof profile !== 'string' ||
    typeof make !== 'boolean'
  ) {
    return null;
  }
  return { room, name, sex, profile, make };
}

/** 保存された値を検証する。古い形・不正な値は Session として使わない */
export function parseSession(value: unknown): TwoShotSession | null {
  if (!isObject(value) || value.v !== 1 || typeof value.token !== 'string') return null;
  if (!TOKEN.test(value.token)) return null;
  if (value.status === 'pending') {
    const request = parseRequest(value.request);
    return request === null ? null : { status: 'pending', token: value.token, request };
  }
  if (value.status === 'active') {
    const { roomId, seat, me } = value;
    if (!isRoomId(roomId) || (seat !== 0 && seat !== 1) || !isObject(me)) return null;
    if (typeof me.name !== 'string' || !isSex(me.sex)) return null;
    return {
      status: 'active',
      token: value.token,
      roomId,
      seat,
      me: { name: me.name, sex: me.sex },
    };
  }
  return null;
}

type Stored = (TwoShotSession & { v: 1 }) | null;

const store = createPersistentStore<Stored>({
  key: 'okiraku:two-shot:session',
  storage: 'session',
  defaults: null,
  parse: (value) => {
    const session = parseSession(value);
    return session === null ? null : { ...session, v: 1 };
  },
});

export const sessionStore = {
  subscribe: store.subscribe,
  getSnapshot: (): TwoShotSession | null => store.getSnapshot(),
  /** SSG と hydration の間は常に入室前 */
  getServerSnapshot: (): TwoShotSession | null => null,
  set(session: TwoShotSession): void {
    store.update({ ...session, v: 1 });
  },
  /** 今の Session がこのトークンのときだけ消す（古い要求が新しい Session を消さないように） */
  clearIfToken(token: string): void {
    store.update((current) => (current?.token === token ? null : current));
  },
};
