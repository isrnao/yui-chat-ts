import { Suspense, useState, useEffect, useCallback } from 'react';
import ChatLogList from '@features/chat/components/ChatLogList';
import { loadInitialChatLogs, loadChatLogsWithPaging } from '@features/chat/api/chatApi';
import { usePreloadChatLogs } from '@features/chat/hooks/usePreloadChatLogs';
import type { Chat } from '@features/chat/types';

export default function ChatLogPage() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // プリロードフック使用
  const preloadPromise = usePreloadChatLogs();

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      // プリロードされたデータがあれば使用
      let initialData: Chat[];
      if (preloadPromise) {
        initialData = await preloadPromise;
      } else {
        // 初回は少量のデータを素早く読み込み
        initialData = await loadInitialChatLogs(Math.min(windowRows, 100));
      }

      setChatLog(initialData);
      setHasMore(initialData.length >= Math.min(windowRows, 100));
    } catch (error) {
      console.error('Failed to load chat logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [windowRows, preloadPromise]);

  const loadMoreData = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const result = await loadChatLogsWithPaging(50, chatLog.length, false);
      setChatLog((prev) => [...prev, ...result.data]);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more chat logs:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatLog.length, isLoadingMore, hasMore]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleRefresh = useCallback(() => {
    setChatLog([]);
    setHasMore(true);
    loadInitialData();
  }, [loadInitialData]);

  // 参加者表示用（空リストでOK）
  return (
    <main className="flex flex-col items-center min-h-screen bg-yui-green/10">
      <header
        className="text-2xl font-bold text-yui-pink my-6"
        style={{ fontFamily: 'var(--tw-font-yui, sans-serif)' }}
      >
        チャットログ閲覧
      </header>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs">表示行数:</span>
        <select
          className="ie-select"
          value={windowRows}
          onChange={(e) => setWindowRows(Number(e.target.value))}
        >
          {[10, 30, 50, 100, 200].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button className="ie-btn" onClick={handleRefresh}>
          再読込
        </button>
        {hasMore && !isLoading && (
          <button className="ie-btn" onClick={loadMoreData} disabled={isLoadingMore}>
            {isLoadingMore ? '読み込み中...' : 'もっと読み込む'}
          </button>
        )}
      </div>
      <Suspense fallback={<div className="text-gray-400 mt-8">チャットログを読み込み中...</div>}>
        <ChatLogList
          chatLog={chatLog}
          isLoading={isLoading}
          windowRows={windowRows}
          participants={[]}
        />
      </Suspense>
    </main>
  );
}
