import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '../rooms';

const ROOM_ID: RoomId = 'superbeginner';

type QueryResult = { data: Chat[] | null; error: null | { message: string; code: string } };

function makeChat(index: number): Chat {
  return {
    uuid: `chat-${index}`,
    room_id: ROOM_ID,
    name: `user-${index}`,
    color: '#000000',
    message: `message-${index}`,
    time: index,
    ip: '',
    ua: '',
  };
}

function makeChats(count: number): Chat[] {
  return Array.from({ length: count }, (_, index) => makeChat(index));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createQueryMock(options: {
  limitResult?: Promise<QueryResult> | QueryResult;
  rangeResult?: Promise<QueryResult> | QueryResult;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => options.limitResult),
    range: vi.fn(() => options.rangeResult),
  };

  return query;
}

async function importResource() {
  const { supabase } = await import('@shared/supabaseClient');
  const from = supabase.from as Mock;
  from.mockReset();

  const resource = await import('./chatLogResource');
  return { resource, from };
}

describe('chatLogResource', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it('dedupes concurrent snapshot loads for the same roomId', async () => {
    const { resource, from } = await importResource();
    const result = deferred<QueryResult>();
    const query = createQueryMock({ limitResult: result.promise });
    from.mockReturnValue(query);

    const first = resource.loadChatLogs(ROOM_ID);
    const second = resource.loadChatLogs(ROOM_ID);

    expect(from).toHaveBeenCalledTimes(1);
    expect(query.limit).toHaveBeenCalledTimes(1);

    result.resolve({ data: makeChats(3), error: null });

    const [firstData, secondData] = await Promise.all([first, second]);
    expect(firstData).toHaveLength(3);
    expect(secondData).toBe(firstData);
  });

  it('omits ip and ua from chat log select columns', async () => {
    const { resource, from } = await importResource();
    const query = createQueryMock({
      limitResult: Promise.resolve({ data: makeChats(1), error: null }),
    });
    from.mockReturnValue(query);

    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(1);

    const selectedColumns = (query.select as Mock).mock.calls[0][0] as string;
    expect(selectedColumns).not.toContain('ip');
    expect(selectedColumns).not.toContain('ua');
    expect(selectedColumns).toContain('metadata');
  });

  it('shares snapshot in-flight work with offset-zero paging and slices the result', async () => {
    const { resource, from } = await importResource();
    const result = deferred<QueryResult>();
    const query = createQueryMock({ limitResult: result.promise });
    from.mockReturnValue(query);

    const snapshot = resource.loadChatLogs(ROOM_ID);
    const page = resource.loadChatLogsWithPaging(ROOM_ID, 0, 50);

    expect(from).toHaveBeenCalledTimes(1);
    expect(query.limit).toHaveBeenCalledTimes(1);

    result.resolve({ data: makeChats(75), error: null });

    await expect(snapshot).resolves.toHaveLength(75);
    await expect(page).resolves.toHaveLength(50);
  });

  it('dedupes offset paging independently from snapshot in-flight work', async () => {
    const { resource, from } = await importResource();
    const snapshotResult = deferred<QueryResult>();
    const pageResult = deferred<QueryResult>();
    const snapshotQuery = createQueryMock({ limitResult: snapshotResult.promise });
    const pageQuery = createQueryMock({ rangeResult: pageResult.promise });
    from.mockReturnValueOnce(snapshotQuery).mockReturnValueOnce(pageQuery);

    const snapshot = resource.loadChatLogs(ROOM_ID);
    const pageA = resource.loadChatLogsWithPaging(ROOM_ID, 100, 50);
    const pageB = resource.loadChatLogsWithPaging(ROOM_ID, 100, 50);

    expect(from).toHaveBeenCalledTimes(2);
    expect(snapshotQuery.limit).toHaveBeenCalledTimes(1);
    expect(pageQuery.range).toHaveBeenCalledTimes(1);

    snapshotResult.resolve({ data: makeChats(100), error: null });
    pageResult.resolve({ data: makeChats(50), error: null });

    await expect(snapshot).resolves.toHaveLength(100);
    await expect(pageA).resolves.toHaveLength(50);
    await expect(pageB).resolves.toHaveLength(50);
  });

  it('removes snapshot in-flight entries after errors so callers can retry', async () => {
    vi.useFakeTimers();

    const { resource, from } = await importResource();
    const errorResult = { data: null, error: { message: 'boom', code: '500' } };
    const errorQuery = createQueryMock({ limitResult: Promise.resolve(errorResult) });
    from.mockReturnValue(errorQuery);

    const failed = resource.loadChatLogs(ROOM_ID);
    const observedFailure = expect(failed).rejects.toThrow('Supabase error: boom (500)');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await observedFailure;
    expect(from).toHaveBeenCalledTimes(3);

    const successQuery = createQueryMock({
      limitResult: Promise.resolve({ data: makeChats(1), error: null }),
    });
    from.mockReset();
    from.mockReturnValue(successQuery);

    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('returns fresh cache without another network request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const { resource, from } = await importResource();
    const query = createQueryMock({
      limitResult: Promise.resolve({ data: makeChats(2), error: null }),
    });
    from.mockReturnValue(query);

    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(2);

    from.mockClear();
    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(2);
    expect(from).not.toHaveBeenCalled();
  });

  it('refetches after the cache TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const { resource, from } = await importResource();
    const firstQuery = createQueryMock({
      limitResult: Promise.resolve({ data: makeChats(2), error: null }),
    });
    const secondQuery = createQueryMock({
      limitResult: Promise.resolve({ data: makeChats(3), error: null }),
    });
    from.mockReturnValueOnce(firstQuery).mockReturnValueOnce(secondQuery);

    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(2);

    vi.setSystemTime(new Date('2026-01-01T00:05:01Z'));

    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(3);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('does not let invalidated in-flight snapshots repopulate the cache', async () => {
    const { resource, from } = await importResource();
    const staleResult = deferred<QueryResult>();
    const staleQuery = createQueryMock({ limitResult: staleResult.promise });
    from.mockReturnValue(staleQuery);

    const staleLoad = resource.loadChatLogs(ROOM_ID);
    resource.invalidateCache(ROOM_ID);
    staleResult.resolve({ data: makeChats(2), error: null });

    await expect(staleLoad).resolves.toHaveLength(2);

    const freshQuery = createQueryMock({
      limitResult: Promise.resolve({ data: makeChats(3), error: null }),
    });
    from.mockReset();
    from.mockReturnValue(freshQuery);

    await expect(resource.loadChatLogs(ROOM_ID)).resolves.toHaveLength(3);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('does not let stale snapshot cleanup remove a newer in-flight snapshot', async () => {
    const { resource, from } = await importResource();
    const staleResult = deferred<QueryResult>();
    const staleQuery = createQueryMock({ limitResult: staleResult.promise });
    from.mockReturnValue(staleQuery);

    const staleLoad = resource.loadChatLogs(ROOM_ID);
    resource.invalidateCache(ROOM_ID);

    const freshResult = deferred<QueryResult>();
    const freshQuery = createQueryMock({ limitResult: freshResult.promise });
    from.mockReset();
    from.mockReturnValue(freshQuery);

    const freshLoad = resource.loadChatLogs(ROOM_ID);
    staleResult.resolve({ data: makeChats(2), error: null });
    await expect(staleLoad).resolves.toHaveLength(2);

    const dedupedFreshLoad = resource.loadChatLogs(ROOM_ID);

    expect(from).toHaveBeenCalledTimes(1);
    freshResult.resolve({ data: makeChats(3), error: null });

    await expect(freshLoad).resolves.toHaveLength(3);
    await expect(dedupedFreshLoad).resolves.toHaveLength(3);
  });
});
