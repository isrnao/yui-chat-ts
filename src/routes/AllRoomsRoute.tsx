import { useState, lazy, Suspense } from 'react';
import { useAllRoomsChatLog } from '@features/chat/hooks/useAllRoomsChatLog';
import { useAllRoomsChatHandlers } from '@features/chat/hooks/useAllRoomsChatHandlers';
import { useReplyTarget } from '@features/chat/hooks/useReplyTarget';
import { useSettings } from '@features/chat/hooks/useSettings';
import { useSEO, usePageView } from '@shared/hooks/useSEO';
import { getRoomMeta } from '@features/chat/rooms';
import type { RoomId } from '@features/chat/rooms';
import type { AvatarId } from '@features/chat/types';
import ChatRoom from '@features/chat/components/ChatRoom';
import EntryForm from '@features/chat/components/EntryForm';
import RoomInfo from '@features/chat/components/RoomInfo';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

const ROOM_META = getRoomMeta('all');

// description は rooms.ts の ROOM_DESCRIPTIONS で集約ビュー固有の文面になる
const ALL_ROOMS_SEO = buildRoomSeo('all');

export default function AllRoomsRoute() {
  useSEO(ALL_ROOMS_SEO);
  usePageView(ALL_ROOMS_SEO.title);

  const measurement = useConversationMeasurement();
  const {
    chatLog,
    isLoading,
    loadError,
    subscribeError,
    isEmpty,
    setChatLog,
    addOptimistic,
    mergeChat,
    reload,
  } = useAllRoomsChatLog(measurement.onRealtimeChat);
  const { replyTarget, setReplyTarget } = useReplyTarget();
  const { settings } = useSettings();

  const [entered, setEntered] = useState(false);
  const [name, setName] = useState(() => settings.name ?? '');
  const [color, setColor] = useState(() => settings.color || '#ff69b4');
  const [email, setEmail] = useState(() => settings.email ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(() => settings.avatar ?? 'none');
  const [message, setMessage] = useState('');
  const [windowRows, setWindowRows] = useState(30);
  const [sendError, setSendError] = useState('');

  const { handleEnter, handleExit, handleSend } = useAllRoomsChatHandlers({
    replyTarget,
    name,
    color,
    email,
    avatar,
    setEntered,
    setChatLog,
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
    measurement,
  });

  const replyTargetTitle = getRoomMeta(replyTarget).title;

  const handleRoomClick = (roomId: RoomId) => {
    setReplyTarget(roomId);
  };

  const wrappedHandleSend = async (msg: string, metadata?: Parameters<typeof handleSend>[1]) => {
    setSendError('');
    try {
      await handleSend(msg, metadata);
    } catch (err) {
      setSendError((err as Error)?.message ?? '送信エラー');
    }
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-yui-green">
          <div className="text-red-600 px-4 py-2">
            全部屋まとめの読み込みに失敗しました。ページを再読み込みしてください。
          </div>
        </div>
      }
    >
      <main className="flex min-h-dvh h-dvh flex-col overflow-hidden bg-yui-green" role="main">
        <header className="sr-only">
          <h1>{ROOM_META.title}</h1>
          <p>{ROOM_META.description}</p>
        </header>
        {(loadError || subscribeError) && (
          <div className="text-red-500 text-xs px-[var(--page-gap)] py-1">
            {loadError && 'チャットログの読み込みに失敗しました。'}
            {subscribeError && 'リアルタイム購読の確立に失敗しました。'}
          </div>
        )}
        {sendError && (
          <div className="text-red-500 text-xs px-[var(--page-gap)] py-1">{sendError}</div>
        )}
        <RetroSplitter
          minTop={100}
          minBottom={100}
          topKind={entered ? 'chat' : 'entry'}
          top={
            entered ? (
              <ChatRoom
                message={message}
                setMessage={setMessage}
                chatLog={chatLog}
                windowRows={windowRows}
                setWindowRows={setWindowRows}
                onExit={handleExit}
                onSend={wrappedHandleSend}
                onReload={reload}
                avatar={avatar}
                userName={name}
                replyTargetTitle={replyTargetTitle}
                onResetReplyTarget={() => setReplyTarget('all')}
              />
            ) : (
              <>
                <EntryForm
                  roomTitle={ROOM_META.title}
                  name={name}
                  setName={setName}
                  color={color}
                  setColor={setColor}
                  email={email}
                  setEmail={setEmail}
                  onEnter={({ name: n, color: c, email: e, silent, avatar: a }) => {
                    setAvatar(a);
                    return handleEnter({ name: n, color: c, email: e, silent });
                  }}
                />
                {/* /chat/all は ChatRoute でなくここに振り分けられるため、
                    プリレンダのフォールバックと同内容を CSR 側でも描画する */}
                <RoomInfo roomId="all" />
              </>
            )
          }
          bottom={
            <Suspense
              fallback={
                <div className="mt-8 animate-pulse text-gray-400">チャットログを読み込み中...</div>
              }
            >
              {isEmpty ? (
                <div className="text-gray-400 px-[var(--page-gap)] py-3 mt-2 font-yui">
                  まだ発言はありません。
                </div>
              ) : (
                <ChatLogList
                  chatLog={chatLog}
                  isLoading={isLoading}
                  windowRows={windowRows}
                  showRoomName
                  onRoomClick={handleRoomClick}
                  hideParticipants
                />
              )}
            </Suspense>
          }
        />
      </main>
    </ErrorBoundary>
  );
}
