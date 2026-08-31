import { Fragment, memo } from 'react';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import { useParticipants } from '@features/chat/hooks/useParticipants';
import { sortChatsByTime } from '@shared/utils/uuid';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import Divider from '../shared/Divider';

type Props = {
  chatLog: Chat[];
  isLoading?: boolean;
  windowRows: number;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
  hideParticipants?: boolean;
};

function ChatLogList({
  chatLog,
  isLoading = false,
  windowRows,
  showRoomName,
  onRoomClick,
  hideParticipants,
}: Props) {
  // 並べ替え結果のメモ化は React Compiler に任せる
  const chats = sortChatsByTime(chatLog).slice(0, windowRows);
  const participants = useParticipants(hideParticipants ? [] : chatLog);

  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
      className="overflow-y-auto rounded-none mt-2 pb-4 font-yui px-[var(--page-gap)]"
      data-testid="chat-log-list"
    >
      {!hideParticipants && <ParticipantsList participants={participants} />}
      <Divider />
      {chats.length === 0 && <div className="text-gray-400 py-3">まだ発言はありません。</div>}
      {chats.map((c) => (
        <Fragment key={c.uuid}>
          <ChatMessage chat={c} showRoomName={showRoomName} onRoomClick={onRoomClick} />
          <Divider />
        </Fragment>
      ))}
    </div>
  );
}

export default memo(ChatLogList);
