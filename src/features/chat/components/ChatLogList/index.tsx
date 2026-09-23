import { Fragment, memo } from 'react';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import Divider from '../shared/Divider';

/** これより多い行を出すときは、画面外の行の描画を省く */
const DEFER_OFFSCREEN_ROWS = 200;

type Props = {
  /** 新しい順に並んだログ（useRoomLog が返すもの）。ここでは並べ直さない */
  chatLog: Chat[];
  isLoading?: boolean;
  windowRows: number;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
  hideParticipants?: boolean;
  /** 直近の取得が失敗したか。true のとき失敗の表示と再読み込みの導線を出す */
  loadError?: boolean;
  /** 失敗の表示から取り直す */
  onRetry?: () => void;
};

function ChatLogList({
  chatLog,
  isLoading = false,
  windowRows,
  showRoomName,
  onRoomClick,
  hideParticipants,
  loadError = false,
  onRetry,
}: Props) {
  // 並び順は Room_Log_Store が保ち、楽観的な発言は先頭に重なる。発言が届くたびに
  // 全体を並べ直さないよう、ここでは切り出すだけにする（Requirement 17）
  const chats = chatLog.slice(0, windowRows);
  const deferOffscreen = chats.length > DEFER_OFFSCREEN_ROWS;

  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
      className="overflow-y-auto rounded-none mt-2 pb-4 font-yui px-[var(--page-gap)]"
      data-testid="chat-log-list"
    >
      {!hideParticipants && <ParticipantsList chatLog={chatLog} />}
      <Divider />
      {loadError && (
        // 非同期に現れるため role="alert" でスクリーンリーダーへ通知する
        <div role="alert" className="text-red-600 text-sm py-3">
          チャットログの読み込みに失敗しました。
          {onRetry && (
            <button type="button" className="ml-2 underline text-blue-700" onClick={onRetry}>
              再読み込み
            </button>
          )}
        </div>
      )}
      {chats.length === 0 && !loadError && (
        <div className="text-gray-400 py-3">まだ発言はありません。</div>
      )}
      {chats.map((c) => (
        <Fragment key={c.uuid}>
          <ChatMessage
            chat={c}
            showRoomName={showRoomName}
            onRoomClick={onRoomClick}
            deferOffscreen={deferOffscreen}
          />
          <Divider />
        </Fragment>
      ))}
    </div>
  );
}

export default memo(ChatLogList);
