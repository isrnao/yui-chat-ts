import { supabase } from '@shared/supabaseClient';
import type { Chat } from '@features/chat/types';

type SupabaseSuccess<T> = { data: T; error: null };
type SupabaseSuccessWithCount<T> = SupabaseSuccess<T[]> & { count: number };

const createAsync = <T>(factory: () => T) => async () => factory();
const asSuccess = <T>(data: T): SupabaseSuccess<T> => ({ data, error: null });
const asSuccessWithCount = <T>(data: T[]): SupabaseSuccessWithCount<T> => ({
  data,
  count: data.length,
  error: null,
});

const noopUnsubscribe = () => {};
const createSubscription = () => ({ unsubscribe: noopUnsubscribe });
const resolveEmpty = createAsync(() => ({ error: null }));

function createQuery(chatLog: Chat[]) {
  const resolveFullLog = createAsync(() => asSuccess(chatLog));
  const resolveWithCount = createAsync(() => asSuccessWithCount(chatLog));

  const query = {
    select: () => query,
    order: () => ({
      limit: resolveFullLog,
      range: resolveWithCount,
    }),
    limit: resolveFullLog,
    range: resolveWithCount,
    insert: (payload: unknown) => {
      const response = asSuccess<null>(null);
      return {
        select: () => ({
          single: createAsync(() =>
            asSuccess({
              uuid: 'mock-inserted',
              time: Date.now(),
              ...(payload as object),
            })
          ),
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve(response)),
      };
    },
    delete: () => ({
      neq: resolveEmpty,
      lt: resolveEmpty,
    }),
    eq: () => query,
    gte: () => query,
    lte: () => query,
    single: createAsync(() => asSuccess(chatLog[0] ?? null)),
  };

  return query;
}

function createChannel() {
  return {
    on: () => ({
      subscribe: () => createSubscription(),
    }),
    subscribe: () => createSubscription(),
  };
}

type MockQueryBuilder = ReturnType<typeof createQuery>;
type MockChannel = ReturnType<typeof createChannel>;

type SupabaseFrom = (typeof supabase)['from'];
type SupabaseChannel = (typeof supabase)['channel'];

type SupabaseMockClient = Omit<typeof supabase, 'from' | 'channel'> & {
  from: (...args: Parameters<SupabaseFrom>) => MockQueryBuilder;
  channel: (...args: Parameters<SupabaseChannel>) => MockChannel;
};

export function setupSupabaseStoryMocks(chatLog: Chat[]) {
  const supabaseMock = supabase as unknown as SupabaseMockClient;

  const originalFrom = supabaseMock.from;
  const originalChannel = supabaseMock.channel;

  supabaseMock.from = (..._args: Parameters<SupabaseFrom>) => createQuery(chatLog);
  supabaseMock.channel = (
    ..._args: Parameters<SupabaseChannel>
  ) => createChannel();

  return () => {
    supabaseMock.from = originalFrom;
    supabaseMock.channel = originalChannel;
  };
}
