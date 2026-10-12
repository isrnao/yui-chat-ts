import { useId, useState, lazy, Suspense } from 'react';
import { getAllRoomsLogStore } from '@features/chat/api/roomLogStore';
import { getWindowRowOptions } from '@features/chat/utils/windowRows';
import { useRoomLog } from '@features/chat/hooks/useRoomLog';
import { useChatIdentity } from '@features/chat/hooks/useChatIdentity';
import { SupersededSessionError, useChatSession } from '@features/chat/hooks/useChatSession';
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
import FilterListDialog from '@features/chat/components/FilterListDialog';
import { useIpFilter } from '@features/chat/hooks/useIpFilter';
import { filterByIp } from '@features/chat/utils/ipFilter';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';
import { toEntryErrorMessage } from '@features/chat/utils/entryError';

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
  // フィルタした伏せ字の IP（.kiro/specs/chat-ip-mute）。「フィルタ」でモーダルの一覧を開く
  const ipFilter = useIpFilter();
  const [filterActive, setFilterActive] = useState(false);
  const [filterRequest, setFilterRequest] = useState(0);
  const filterDialogId = useId();
  const filterSummary = filterActive ? filterByIp(chatLog, ipFilter) : null;

  const handleExit = () => {
    // 保存を待つ前に入力欄と表示状態を同期で戻してから退室する（退室操作は即座に反映させる）。
    // 退室メッセージの名前はこのレンダーの identity の値なので、戻した後でも変わらない
    setFilterRequest(0);
    setFilterActive(false);
    setName('');
    return session.exit();
  };

  const replyTargetTitle = getRoomMeta(replyTarget).title;

  const handleRoomClick = (roomId: RoomId) => {
    setReplyTarget(roomId);
  };

  const wrappedHandleSend = (msg: string, metadata?: ChatMetadata) => session.send(msg, metadata);

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
        {subscribeError && (
          <div role="status" className="text-xs px-[var(--page-gap)]">
            再接続中...
          </div>
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
                sessionPending={session.phase === 'entering'}
                failedMessage={session.failedSend?.chat.message}
                onRetrySend={session.retry}
                onExit={handleExit}
                onSend={wrappedHandleSend}
                onReload={reload}
                avatar={session.sessionIdentity?.avatar ?? avatar}
                userName={session.sessionIdentity?.name ?? name}
                userColor={session.sessionIdentity?.color ?? color}
                replyTargetTitle={replyTargetTitle}
                onResetReplyTarget={() => setReplyTarget('all')}
                filterCount={ipFilter.entries?.length ?? 0}
                filterDialogId={filterDialogId}
                onToggleFilter={() => setFilterRequest((request) => request + 1)}
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
                  retryAvatar={entryError ? avatar : undefined}
                  isPending={session.phase === 'exiting'}
                  onEnter={async ({ name: n, color: c, silent, avatar: a, email: e }) => {
                    setAvatar(a);
                    setEntryError('');
                    try {
                      await session.enter({ name: n, color: c, silent, email: e, avatar: a });
                    } catch (err) {
                      if (!(err instanceof SupersededSessionError))
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
                  contained
                  chatLog={chatLog}
                  isLoading={isLoading}
                  windowRows={windowRows}
                  showRoomName
                  onRoomClick={handleRoomClick}
                  loadError={loadError}
                  onRetry={reload}
                  hideParticipants
                  ipFilter={ipFilter}
                />
              )}
            </Suspense>
          }
        />
        {
          <FilterListDialog
            entries={ipFilter.entries ?? []}
            dialogId={filterDialogId}
            request={filterRequest}
            onOpen={() => setFilterActive(true)}
            hiddenCounts={filterSummary?.hiddenCounts ?? new Map()}
            hiddenNames={filterSummary?.hiddenNames}
            onClose={() => setFilterActive(false)}
          />
        }
      </main>
    </ErrorBoundary>
  );
}
