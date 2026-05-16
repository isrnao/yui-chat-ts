import { Fragment, memo, useMemo } from 'react';
import type { Chat } from '@features/chat/types';
import { useParticipants } from '@features/chat/hooks/useParticipants';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import Divider from '../shared/Divider';

type Props = {
  chatLog: Chat[];
  isLoading?: boolean;
  windowRows: number;
};

function ChatLogList({ chatLog, isLoading = false, windowRows }: Props) {
  const chats = useMemo(() => chatLog.slice(0, windowRows), [chatLog, windowRows]);
  const participants = useParticipants(chatLog);

  // 読み込み中の場合は専用のローディング表示を返す
  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
      className="overflow-y-auto rounded-none mt-2 pb-4 font-yui px-[var(--page-gap)]"
      data-testid="chat-log-list"
    >
      <ParticipantsList participants={participants} />
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

export default memo(ChatLogList);
