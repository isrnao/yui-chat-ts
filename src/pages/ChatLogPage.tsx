import { Suspense, useState, useEffect, useCallback } from 'react';
import ChatLogList from '@features/chat/components/ChatLogList';
import { loadChatLogsWithPaging } from '@features/chat/api/chatApi';
import { usePreloadChatLogs } from '@features/chat/hooks/usePreloadChatLogs';
import Button from '@shared/components/Button';
import type { Chat } from '@features/chat/types';
import { DEFAULT_ROOM_ID } from '@features/chat/rooms';

export default function ChatLogPage() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // プリロードフック使用
  const preloadPromise = usePreloadChatLogs(DEFAULT_ROOM_ID);

  // windowRows 変更時はリロード扱い: render 中に「前回値からの変化検知」で state を巻き戻す
  // （effect 内 setState を避けるための React 公式推奨パターン）
  const [prevWindowRows, setPrevWindowRows] = useState(windowRows);
  if (windowRows !== prevWindowRows) {
    setPrevWindowRows(windowRows);
    setChatLog([]);
    setHasMore(true);
    setIsLoading(true);
  }

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        // プリロード (usePreloadChatLogs 内で loadInitialChatLogs が走り、
        // chatLogResource のキャッシュに canonical snapshot が積まれている) を待機。
        // 結果は破棄して、hasMore を正確に返す loadChatLogsWithPaging 経由で再取得する。
        await preloadPromise;
        const limit = Math.min(windowRows, 100);
        const result = await loadChatLogsWithPaging(DEFAULT_ROOM_ID, limit, 0, true);
        if (ignore) return;
        setChatLog(result.data);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error('Failed to load chat logs:', error);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [windowRows, preloadPromise, reloadKey]);

  const loadMoreData = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const result = await loadChatLogsWithPaging(DEFAULT_ROOM_ID, 50, chatLog.length, false);
      setChatLog((prev) => [...prev, ...result.data]);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more chat logs:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatLog.length, isLoadingMore, hasMore]);

  const handleRefresh = useCallback(() => {
    setChatLog([]);
    setHasMore(true);
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <main className="flex flex-col items-center min-h-dvh bg-yui-green/10">
      <header className="text-2xl font-bold text-yui-pink my-6 font-yui">チャットログ閲覧</header>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs">表示行数:</span>
        <select
          className="border-2 border-ie-gray [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none outline-none font-yui focus:border-2 focus:border-ie-blue focus:bg-[#f8fafd]"
          value={windowRows}
          onChange={(e) => setWindowRows(Number(e.target.value))}
        >
          {[10, 30, 50, 100, 200].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <Button type="button" onClick={handleRefresh}>
          再読込
        </Button>
        {hasMore && !isLoading && (
          <Button type="button" onClick={loadMoreData} disabled={isLoadingMore}>
            {isLoadingMore ? '読み込み中...' : 'もっと読み込む'}
          </Button>
        )}
      </div>
      <Suspense fallback={<div className="text-gray-400 mt-8">チャットログを読み込み中...</div>}>
        <ChatLogList chatLog={chatLog} isLoading={isLoading} windowRows={windowRows} />
      </Suspense>
    </main>
  );
}
