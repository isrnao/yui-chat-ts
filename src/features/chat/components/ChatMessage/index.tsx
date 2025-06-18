import { formatTime } from '@shared/utils/format';
import type { Chat } from '@features/chat/types';

type Props = {
  chat: Chat;
};

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
        {chat.sending && <small className="text-gray-500"> (Sending...)</small>}
        <span className="ml-2 text-gray-400 text-xs">({formatTime(chat.time)})</span>
      </div>
    </>
  );
}
