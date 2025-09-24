import { supabase } from '@shared/supabaseClient';
import type { Chat } from '@features/chat/types';

function createQuery(chatLog: Chat[]) {
  const orderQuery = {
    limit: async () => ({ data: chatLog, error: null }),
    range: async () => ({ data: chatLog, count: chatLog.length, error: null }),
  };

  const query = {
    select: () => query,
    order: () => orderQuery,
    limit: async () => ({ data: chatLog, error: null }),
    range: async () => ({ data: chatLog, count: chatLog.length, error: null }),
    insert: (payload: unknown) => {
      const response = { data: null, error: null };
      return {
        select: () => ({
          single: async () => ({
            data: {
              uuid: 'mock-inserted',
              time: Date.now(),
              ...(payload as object),
            },
            error: null,
          }),
        }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(response)),
      };
    },
    delete: () => ({
      neq: async () => ({ error: null }),
      lt: async () => ({ error: null }),
    }),
    eq: () => query,
    gte: () => query,
    lte: () => query,
    single: async () => ({ data: chatLog[0] ?? null, error: null }),
  };

  return query;
}

function createChannel() {
  return {
    on: () => ({
      subscribe: () => ({
        unsubscribe: () => {},
      }),
    }),
    subscribe: () => ({
      unsubscribe: () => {},
    }),
  };
}

export function setupSupabaseStoryMocks(chatLog: Chat[]) {
  const originalFrom = supabase.from.bind(supabase);
  const originalChannel = supabase.channel.bind(supabase);

  (supabase as any).from = () => createQuery(chatLog);
  (supabase as any).channel = () => createChannel();

  return () => {
    (supabase as any).from = originalFrom;
    (supabase as any).channel = originalChannel;
  };
}
