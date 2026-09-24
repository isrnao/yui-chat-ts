import type { ErrorCode, RoomView } from '../../../../supabase/functions/two-shot/rules.ts';
import { sessionStore, type ActiveSession } from './sessionStore';
import { callTwoShot } from './twoShotApi';

/**
 * 入室後の初期表示の外部ストア。spec: design.md §8「初期取得」
 *
 * active な Session ごとに 1 つ。最初の購読で read を 1 回送る（入室の応答を初期値として渡したときは送らない）。
 * レンダーや getSnapshot の中では通信も Session の更新もしない。最後の購読が外れたら取得を中断し、
 * キャッシュを捨てる（同じルートに戻っても古いログを確定値として出さない）。
 */
export type RoomInitial =
  | { kind: 'loading' }
  | { kind: 'ready'; view: RoomView }
  /** 通信の失敗。Session は消さず、保存した me で上ペインを出して E12 から手動で取り直せる */
  | { kind: 'error' }
  /** トークンが失効していた。Session は消したので、ページは入口に戻る */
  | { kind: 'invalid' };

export interface RoomResource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RoomInitial;
  getServerSnapshot(): RoomInitial;
}

const LOADING: RoomInitial = { kind: 'loading' };
/** 失効として扱うお知らせ（入室後の画面を出さずに入口へ戻す） */
const INVALID_CODES: readonly ErrorCode[] = ['E3', 'E4', 'E6'];

const resources = new Map<string, RoomResource>();
const seeds = new Map<string, RoomView>();

/** 入室の応答を初期値として渡す（入室の直後に取り直さない） */
export function seedRoomResource(token: string, view: RoomView): void {
  seeds.set(token, view);
}

function createRoomResource(session: ActiveSession, fetcher: typeof callTwoShot): RoomResource {
  let state: RoomInitial = LOADING;
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null;
  let releaseScheduled = false;

  const set = (next: RoomInitial) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const start = () => {
    const seed = seeds.get(session.token);
    if (seed) {
      seeds.delete(session.token);
      state = { kind: 'ready', view: seed };
      return;
    }
    state = LOADING;
    const current = new AbortController();
    controller = current;
    void fetcher({ room: session.roomId, op: 'read' }, session.token, current.signal).then(
      (result) => {
        if (controller !== current) return; // 解除された
        controller = null;
        if (result === 'failed' || (result.ok && result.screen === 'lobby')) {
          set({ kind: 'error' });
        } else if (result.ok) {
          // 表示用の me と席を更新する（トークンが同じときだけ）
          const now = sessionStore.getSnapshot();
          if (now?.status === 'active' && now.token === session.token) {
            sessionStore.set({ ...now, seat: result.room.seat, me: result.room.me });
          }
          set({ kind: 'ready', view: result.room });
        } else if (INVALID_CODES.includes(result.notice)) {
          sessionStore.clearIfToken(session.token);
          set({ kind: 'invalid' });
        } else {
          set({ kind: 'error' });
        }
      }
    );
  };

  const dispose = () => {
    controller?.abort();
    controller = null;
    state = LOADING;
    resources.delete(session.token);
  };

  return {
    subscribe(listener) {
      const wasIdle = listeners.size === 0;
      listeners.add(listener);
      if (wasIdle && state === LOADING && controller === null) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || releaseScheduled) return;
        releaseScheduled = true;
        queueMicrotask(() => {
          releaseScheduled = false;
          if (listeners.size === 0) dispose();
        });
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => LOADING,
  };
}

/** Session ごとの初期表示のストア（トークンで 1 つにまとめる） */
export function getRoomResource(
  session: ActiveSession,
  fetcher: typeof callTwoShot = callTwoShot
): RoomResource {
  let resource = resources.get(session.token);
  if (!resource) {
    resource = createRoomResource(session, fetcher);
    resources.set(session.token, resource);
  }
  return resource;
}
