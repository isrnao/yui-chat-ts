import type { LobbyState } from '../components/RoomList';
import { fetchLobby } from './twoShotApi';

/**
 * 空室状況の外部ストア。spec: design.md §8「自動更新と一覧ストア」
 *
 * 最初の購読で取得を始め、reload() で取り直す。取得中にもう一度 reload() しても重ねない（今の取得を共有する）。
 * 古い取得の結果は成功・失敗とも捨てる。最後の購読が外れたら取得を中断し、次の購読では取り直す。
 * 取得に失敗したら、前回の結果があっても error にする（原作は毎回その時点の状態を描くため）。
 */
export interface LobbyStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): LobbyState;
  getServerSnapshot(): LobbyState;
  reload(): void;
}

const IDLE: LobbyState = { kind: 'idle' };

export function createLobbyStore(fetcher: typeof fetchLobby = fetchLobby): LobbyStore {
  let state: LobbyState = IDLE;
  const listeners = new Set<() => void>();
  let generation = 0;
  let inFlight: AbortController | null = null;
  let releaseScheduled = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const load = () => {
    if (inFlight !== null) return; // 取得中なら共有する
    const current = ++generation;
    const controller = new AbortController();
    inFlight = controller;
    void fetcher(controller.signal).then((result) => {
      if (current !== generation) return;
      inFlight = null;
      state = result === 'failed' ? { kind: 'error' } : { kind: 'loaded', rows: result };
      emit();
    });
  };

  const dispose = () => {
    generation++;
    inFlight?.abort();
    inFlight = null;
    state = IDLE;
  };

  return {
    subscribe(listener) {
      const wasIdle = listeners.size === 0;
      listeners.add(listener);
      if (wasIdle && inFlight === null && state === IDLE) load();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || releaseScheduled) return;
        // StrictMode の購読 → 解除 → 再購読で取得をやり直さないよう、マイクロタスクまで待つ
        releaseScheduled = true;
        queueMicrotask(() => {
          releaseScheduled = false;
          if (listeners.size === 0) dispose();
        });
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => IDLE,
    reload: load,
  };
}

export const lobbyStore = createLobbyStore();
