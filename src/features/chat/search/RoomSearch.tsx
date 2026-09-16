import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { isEnabledRoomId, type RoomId } from '../rooms';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { trackEvent } from '@shared/utils/analytics';

const ChatSearchPanel = lazy(() => import('./ChatSearchPanel'));

export default function RoomSearch({
  roomId,
  onReturn,
  children,
}: {
  roomId: RoomId;
  onReturn: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function backToChat() {
    setOpen(false);
    onReturn();
    trackEvent('search_return_to_chat', { room_id: roomId });
    trigger.current?.focus();
  }
  const rooms = (import.meta.env.VITE_CHAT_SEARCH_ROOMS ?? '').split(',');
  if (roomId === 'all' || !isEnabledRoomId(roomId) || !rooms.includes(roomId))
    return <>{children}</>;
  return (
    <>
      <div className="px-[var(--page-gap)] py-1 text-sm">
        <button
          ref={trigger}
          type="button"
          className="underline text-green-800"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          この部屋を検索
        </button>
      </div>
      {open ? (
        <ErrorBoundary
          fallback={
            <div role="alert">
              検索画面を読み込めませんでした。
              <button type="button" onClick={backToChat}>
                現在の会話へ戻る
              </button>
            </div>
          }
        >
          <Suspense
            fallback={
              <div>
                <p role="status">検索画面を読み込み中...</p>
                <button type="button" onClick={backToChat}>
                  現在の会話へ戻る
                </button>
              </div>
            }
          >
            <ChatSearchPanel key={roomId} roomId={roomId} onBack={backToChat} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        children
      )}
    </>
  );
}
