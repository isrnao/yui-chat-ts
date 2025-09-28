import { Fragment } from 'react';
import type { Chat, Participant } from '@features/chat/types';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import Divider from '../shared/Divider';
import { sortChatsByTime } from '@shared/utils/uuid';

type Props = {
  chatLog: Chat[];
  isLoading?: boolean;
  windowRows: number;
  participants: Participant[];
  currentTime?: number;
};

export default function ChatLogList({
  chatLog,
  isLoading = false,
  windowRows,
  participants,
  currentTime,
}: Props) {
  const chats = sortChatsByTime([...chatLog]).slice(0, windowRows);
  const displayTime = currentTime ?? Date.now();

  // 読み込み中の場合は専用のローディング表示を返す
  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
      className="overflow-y-auto rounded-none mt-2 pb-4 font-yui px-[var(--page-gap)]"
      data-testid="chat-log-list"
    >
      <ParticipantsList participants={participants} currentTime={displayTime} />
      {/* IE風区切り線（上下二重線） */}
      <Divider />
      {chats.length === 0 && <div className="text-gray-400 py-3">まだ発言はありません。</div>}
      {chats.map((c) => (
        <Fragment key={c.uuid}>
          <ChatMessage chat={c} />
          <Divider />
        </Fragment>
      ))}
    </div>
  );
}
