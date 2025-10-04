import { useEffect, useRef } from 'react';
import type { Chat } from '../chat/types';
import type { ChatApi } from '../api/chat';

export function usePreloadChatLogs(chatApi: ChatApi, limit = 100) {
  const preloadPromiseRef = useRef<Promise<Chat[]> | null>(null);

  useEffect(() => {
    if (!preloadPromiseRef.current) {
      preloadPromiseRef.current = chatApi.loadInitialChatLogs(limit).catch(() => []);
    }
  }, [chatApi, limit]);

  return preloadPromiseRef.current;
}

export async function preloadChatLogs(chatApi: ChatApi, limit = 50): Promise<void> {
  try {
    await chatApi.loadInitialChatLogs(limit);
  } catch (error) {
    // swallow preload errors - real fetch will handle it later
  }
}

export function preconnectSupabase(
  documentRef: Pick<Document, 'createElement' | 'head'> | null,
  supabaseUrl: string,
) {
  if (!documentRef) return;

  try {
    const dnsLink = documentRef.createElement('link');
    dnsLink.rel = 'dns-prefetch';
    dnsLink.href = supabaseUrl;
    documentRef.head.appendChild(dnsLink);

    const preconnectLink = documentRef.createElement('link');
    preconnectLink.rel = 'preconnect';
    preconnectLink.href = supabaseUrl;
    preconnectLink.crossOrigin = 'anonymous';
    documentRef.head.appendChild(preconnectLink);
  } catch (error) {
    // ignore DOM errors in non-browser environments
  }
}
