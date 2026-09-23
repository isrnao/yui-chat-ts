import { useState, lazy, Suspense } from 'react';
import { getAllRoomsLogStore } from '@features/chat/api/roomLogStore';
import { getWindowRowOptions } from '@features/chat/utils/windowRows';
import { useRoomLog } from '@features/chat/hooks/useRoomLog';
import { useChatIdentity } from '@features/chat/hooks/useChatIdentity';
import { useChatSession } from '@features/chat/hooks/useChatSession';
import { useReplyTarget } from '@features/chat/hooks/useReplyTarget';
import { useSettings } from '@features/chat/hooks/useSettings';
import { useSEO, usePageView } from '@shared/hooks/useSEO';
import { getRoomMeta } from '@features/chat/rooms';
import type { RoomId } from '@features/chat/rooms';
import type { ChatMetadata } from '@features/chat/types';
import ChatRoom from '@features/chat/components/ChatRoom';
import EntryForm from '@features/chat/components/EntryForm';
import RoomInfo from '@features/chat/components/RoomInfo';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';
import { toEntryErrorMessage } from '@features/chat/utils/entryError';
import { toUserMessage } from '@features/chat/utils/userFacingError';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

const ROOM_META = getRoomMeta('all');

// description は rooms.ts の ROOM_DESCRIPTIONS で集約ビュー固有の文面になる
const ALL_ROOMS_SEO = buildRoomSeo('all');

export default function AllRoomsRoute() {
  useSEO(ALL_ROOMS_SEO);
  usePageView(ALL_ROOMS_SEO.title);

  const measurement = useConversationMeasurement();
  const [windowRows, setWindowRows] = useState(30);
  const store = getAllRoomsLogStore();
  const { chatLog, isLoading, loadError, isEmpty, realtimeStatus, addOptimistic, reload, expand } =
    useRoomLog(store, measurement.onRealtimeChat);
  const subscribeError = realtimeStatus === 'disconnected';
  const { replyTarget, setReplyTarget } = useReplyTarget();
  const { settings } = useSettings();
  const identity = useChatIdentity(settings);
  const { name, setName, color, setColor, email, setEmail, avatar, setAvatar } = identity;
  const session = useChatSession({
    target: { kind: 'all', replyTo: replyTarget },
    identity,
    store,
    addOptimistic,
    measurement,
  });
  const { entered } = session;
  // 入室の失敗は EntryForm ではなくここで持つ。入室中は EntryForm がアンマウントされ、
  // 失敗して戻ってきたときには別のインスタンスになるため。
  const [entryError, setEntryError] = useState('');
  const [sendError, setSendError] = useState('');

  const handleExit = () => {
    // 保存を待つ前に入力欄と表示状態を同期で戻してから退室する（退室操作は即座に反映させる）。
    // 退室メッセージの名前はこのレンダーの identity の値なので、戻した後でも変わらない
    setName('');
    return session.exit();
  };

  const replyTargetTitle = getRoomMeta(replyTarget).title;

  const handleRoomClick = (roomId: RoomId) => {
    setReplyTarget(roomId);
  };

  const wrappedHandleSend = async (msg: string, metadata?: ChatMetadata) => {
    setSendError('');
    try {
      await session.send(msg, metadata);
    } catch (err) {
      setSendError(
        toUserMessage(err, '発言を送信できませんでした。時間をおいてもう一度お試しください。')
      );
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
                windowRows={windowRows}
                setWindowRows={(rows) => {
                  setWindowRows(rows);
                  // 取得件数（既定 200）より多い行数を選んだら、その件数まで取得を広げる
                  expand(rows);
                }}
                windowRowOptions={getWindowRowOptions('all')}
                onExit={handleExit}
                onSend={wrappedHandleSend}
                onReload={reload}
                avatar={avatar}
                userName={name}
                userColor={color}
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
                  error={entryError}
                  onEnter={async ({ name: n, color: c, silent, avatar: a }) => {
                    setAvatar(a);
                    setEntryError('');
                    try {
                      await session.enter({ name: n, color: c, silent });
                    } catch (err) {
                      setEntryError(toEntryErrorMessage(err));
                      throw err;
                    }
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
