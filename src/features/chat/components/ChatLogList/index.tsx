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
};

export default function ChatLogList({
  chatLog,
  isLoading = false,
  windowRows,
  participants,
}: Props) {
  const chats = sortChatsByTime([...chatLog]).slice(0, windowRows);

  // 読み込み中の場合は専用のローディング表示を返す
  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
      className="overflow-y-auto rounded-none mt-2 [font-family:var(--font-yui)]"
      data-testid="chat-log-list"
    >
      <ParticipantsList participants={participants} />
      {/* IE風区切り線（上下二重線） */}
      <Divider />
      {chats.length === 0 && <div className="text-gray-400 py-3">まだ発言はありません。</div>}
      {chats.map((c) => (
        <div key={c.uuid}>
          <ChatMessage chat={c} />
          <Divider />
        </div>
      ))}
    </div>
  );
}
