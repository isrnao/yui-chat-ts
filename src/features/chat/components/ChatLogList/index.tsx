import type { Chat, Participant } from '@features/chat/types';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import Divider from '../shared/Divider';

type Props = {
  chatLog: Chat[];
  windowRows: number;
  participants: Participant[];
};

export default function ChatLogList({ chatLog, windowRows, participants }: Props) {
  const chats = [...chatLog].sort((a, b) => b.time - a.time).slice(0, windowRows);

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
        <div key={c.id}>
          <ChatMessage chat={c} />
          <Divider />
        </div>
      ))}
    </div>
  );
}
