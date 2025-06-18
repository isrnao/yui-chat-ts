import { Suspense, useState, useEffect } from 'react';
import ChatLogList from '@features/chat/components/ChatLogList';
import { loadChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

export default function ChatLogPage() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(50);

  useEffect(() => {
    loadChatLogs().then(setChatLog);
  }, []);

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
          {[10, 30, 50, 100, 200, 1000].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button className="ie-btn" onClick={() => loadChatLogs().then(setChatLog)}>
          再読込
        </button>
      </div>
      <Suspense fallback={<div className="text-gray-400 mt-8">チャットログを読み込み中...</div>}>
        <ChatLogList chatLog={chatLog} windowRows={windowRows} participants={[]} />
      </Suspense>
    </main>
  );
}
