import { describe, it, expect, vi } from 'vitest';
import type { Chat } from '@features/chat/types';
import type { RealtimeStatus } from './realtime';
import { createRoomLogStore, type LogSource } from './roomLogStore';

vi.mock('./chatQueries', () => ({
  loadRecentChatLogs: vi.fn(),
  loadAllRoomsChatLogs: vi.fn(),
}));
vi.mock('./realtime', () => ({
  subscribeChatLogs: vi.fn(),
  subscribeAllRoomsChatLogs: vi.fn(),
}));

function chat(uuid: string, n: number): Chat {
  // uuid v7 の形にして、降順の並べ替えが uuid で決まるようにする
  const hex = n.toString(16).padStart(12, '0');
  return {
    uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${uuid.padStart(12, '0')}`,
    name: 'ゆい',
    color: '#000',
    message: uuid,
    time: n,
    ip_masked: '',
    ua: '',
  };
}

/** 取得と購読をテストから操作できる偽の LogSource */
function fakeSource(initialLimit = 10) {
  const fetches: Array<{
    limit: number;
    resolve: (chats: Chat[]) => void;
    reject: (error: Error) => void;
  }> = [];
  let onInsert: ((chat: Chat) => void) | null = null;
  let onStatus: ((status: RealtimeStatus) => void) | null = null;
  const unsubscribe = vi.fn();
  const source: LogSource = {
    initialLimit,
    fetch: (limit) =>
      new Promise<Chat[]>((resolve, reject) => {
        fetches.push({ limit, resolve, reject });
      }),
    subscribe: vi.fn((insert, status) => {
      onInsert = insert;
      onStatus = status;
      return { unsubscribe };
    }),
  };
  return {
    source,
    fetches,
    unsubscribe,
    insert: (c: Chat) => onInsert!(c),
    status: (s: RealtimeStatus) => onStatus!(s),
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const messages = (chats: Chat[]) => chats.map((c) => c.message);

describe('Room_Log_Store', () => {
  it('最初の購読で Realtime を張ってから取得を始め、結果を ready で公開する', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());

    store.subscribe(() => {});
    expect(fake.source.subscribe).toHaveBeenCalledTimes(1);
    expect(fake.fetches).toHaveLength(1);
    expect(fake.fetches[0]).toMatchObject({ limit: 10 });

    fake.fetches[0]!.resolve([chat('a', 1)]);
    await flush();
    expect(store.getSnapshot().status).toBe('ready');
    expect(messages(store.getSnapshot().chats)).toEqual(['a']);
  });

  it('取得中に届いた発言は取得結果に無くても残す', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});

    fake.insert(chat('remote', 2));
    fake.fetches[0]!.resolve([chat('older', 1)]);
    await flush();

    expect(messages(store.getSnapshot().chats)).toEqual(['remote', 'older']);
  });

  it('SUBSCRIBED に遷移したときだけ取り直す', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});

    fake.status('connected');
    fake.status('connected');
    expect(fake.fetches).toHaveLength(2);

    fake.status('disconnected');
    fake.status('connected');
    expect(fake.fetches).toHaveLength(3);
    expect(store.getSnapshot().realtime).toBe('connected');
  });

  it('拡張では表示中の発言を残し、通常の取り直しでは取得結果を正とする', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    fake.fetches[0]!.resolve([chat('kept', 3), chat('deleted-later', 2)]);
    await flush();

    store.expand(100);
    expect(fake.fetches[1]).toMatchObject({ limit: 100 });
    fake.fetches[1]!.resolve([chat('old', 1)]);
    await flush();
    expect(messages(store.getSnapshot().chats)).toEqual(['kept', 'deleted-later', 'old']);

    // 別クライアントで論理削除された発言は、取り直しの結果に合わせて消える
    store.reload();
    fake.fetches[2]!.resolve([chat('kept', 3), chat('old', 1)]);
    await flush();
    expect(messages(store.getSnapshot().chats)).toEqual(['kept', 'old']);
  });

  it('件数は減らす方向に戻さない', () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    store.expand(1000);
    store.expand(30);
    expect(fake.fetches.map((f) => f.limit)).toEqual([10, 1000]);
  });

  it('新しい取得が始まったら古い取得の結果は捨てる', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    store.reload();

    fake.fetches[1]!.resolve([chat('new', 2)]);
    fake.fetches[0]!.resolve([chat('stale', 1)]);
    await flush();
    expect(messages(store.getSnapshot().chats)).toEqual(['new']);
  });

  it('取得に失敗すると error にし、表示中の行は残す', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    fake.fetches[0]!.resolve([chat('a', 1)]);
    await flush();

    store.reload();
    fake.fetches[1]!.reject(new Error('network'));
    await flush();
    expect(store.getSnapshot().status).toBe('error');
    expect(messages(store.getSnapshot().chats)).toEqual(['a']);
  });

  it('StrictMode の購読 → 解除 → 再購読では channel を張り直さない', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    const unsubscribe = store.subscribe(() => {});
    unsubscribe();
    store.subscribe(() => {});
    await flush();

    expect(fake.source.subscribe).toHaveBeenCalledTimes(1);
    expect(fake.unsubscribe).not.toHaveBeenCalled();
  });

  it('最後の購読が外れたら止め、次の購読で状態を初期化して再開する', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    const unsubscribe = store.subscribe(() => {});
    store.expand(1000);
    fake.fetches[1]!.resolve([chat('a', 1)]);
    await flush();

    unsubscribe();
    await flush();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);

    store.subscribe(() => {});
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(fake.fetches[fake.fetches.length - 1]).toMatchObject({ limit: 10 });
  });

  it('Realtime の INSERT を onInsert のリスナーへ伝える', () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    const listener = vi.fn();
    store.subscribe(() => {});
    const off = store.onInsert(listener);

    fake.insert(chat('x', 1));
    off();
    fake.insert(chat('y', 2));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('取得中に合流した保存の確定値は、古い取得結果で消さない', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    store.reload();

    // 取得（1 件目の reload）の途中で自分の発言の保存が終わる
    store.applySaved(chat('mine', 5));
    // 取得結果は保存より前のスナップショット
    fake.fetches[1]!.resolve([chat('older', 1)]);
    await flush();

    expect(messages(store.getSnapshot().chats)).toEqual(['mine', 'older']);
  });

  it('取得中に行った書き換え（clear の反映）は、古い取得結果で巻き戻さない', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    fake.fetches[0]!.resolve([chat('mine', 2), chat('other', 1)]);
    await flush();

    store.reload();
    store.update((chats) => chats.filter((c) => c.message !== 'mine'));
    // 取得結果は削除より前のスナップショットで、消した発言を含んでいる
    fake.fetches[1]!.resolve([chat('mine', 2), chat('other', 1)]);
    await flush();

    expect(messages(store.getSnapshot().chats)).toEqual(['other']);
  });

  it('取得が終わった後の書き換えは、次の取得結果には適用しない', async () => {
    const fake = fakeSource();
    const store = createRoomLogStore(fake.source);
    store.subscribe(() => {});
    fake.fetches[0]!.resolve([chat('a', 1)]);
    await flush();
    store.update((chats) => chats.filter((c) => c.message !== 'a'));

    store.reload();
    fake.fetches[1]!.resolve([chat('a', 1)]);
    await flush();
    expect(messages(store.getSnapshot().chats)).toEqual(['a']);
  });
});
