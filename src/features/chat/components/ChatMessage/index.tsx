import { formatTime } from '@shared/utils/format';
import type { Chat } from '@features/chat/types';

type Props = {
  chat: Chat;
};

// 楽観的更新時の時刻表示を生成
function getTimeDisplay(chat: Chat): string {
  if (chat.optimistic) {
    return '送信中...';
  }
  return formatTime(chat.time);
}

export default function ChatMessage({ chat }: Props) {
  return (
    <>
      <div className="mb-1">
        <span className="font-bold" style={{ color: chat.color, fontSize: '1.08em' }}>
          {chat.name}
        </span>
        {chat.email ? (
          <a
            className="font-bold text-gray-400 underline text-blue-600 px-1"
            href={`mailto:${chat.email}`}
            title={chat.email}
            target="_blank"
            rel="noopener noreferrer"
          >
            {'>'}
          </a>
        ) : (
          <span className="font-bold text-gray-400 px-1">{'>'}</span>
        )}
        <span className="ml-1 text-gray-700">{chat.message}</span>
        <span
          className={`ml-2 text-xs ${chat.optimistic ? 'text-amber-500 animate-pulse' : 'text-gray-400'}`}
        >
          ({getTimeDisplay(chat)})
        </span>
      </div>
    </>
  );
}
