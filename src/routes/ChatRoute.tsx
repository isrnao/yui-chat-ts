import { useState, lazy, Suspense } from 'react';
import { getRoomLogStore, FULL_CHAT_LOG_LIMIT } from '@features/chat/api/roomLogStore';
import { useRoomLog } from '@features/chat/hooks/useRoomLog';
import { useChatIdentity } from '@features/chat/hooks/useChatIdentity';
import { useChatSession } from '@features/chat/hooks/useChatSession';
import { useLookSound } from '@features/chat/hooks/useLookSound';
import { useSettings } from '@features/chat/hooks/useSettings';
import { useSEO, usePageView } from '@shared/hooks/useSEO';
import ChatRoom from '@features/chat/components/ChatRoom';
import EntryForm from '@features/chat/components/EntryForm';
import RoomInfo from '@features/chat/components/RoomInfo';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import ChatRanking from '@features/chat/components/ChatRanking';
import { useRoomRanking } from '@features/chat/hooks/useRoomRanking';
import type { ChatMetadata } from '@features/chat/types';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import { getWindowRowOptions } from '@features/chat/utils/windowRows';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';
import { toEntryErrorMessage } from '@features/chat/utils/entryError';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

export default function ChatRoute({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);

  // プリレンダ (scripts/prerender-rooms.ts) と同一ソースからメタを導出し、
  // 静的 HTML とランタイムのメタタグ不一致を防ぐ
  const seo = buildRoomSeo(roomId);
  useSEO(seo);
  usePageView(seo.title);

  const measurement = useConversationMeasurement();
  const store = getRoomLogStore(roomId);
  const { chatLog, isLoading, loadError, addOptimistic, reload, expand } = useRoomLog(
    store,
    measurement.onRealtimeChat
  );
  // localStorage に保存された前回入室時の設定を、入室者の状態の既定値にする
  const { settings } = useSettings();
  const identity = useChatIdentity(settings);
  const { name, setName, color, setColor, email, setEmail, avatar, setAvatar } = identity;
  const session = useChatSession({
    target: { kind: 'room', roomId },
    identity,
    store,
    addOptimistic,
    measurement,
  });
  const { entered } = session;
  // 入室の失敗は EntryForm ではなくここで持つ。入室中は EntryForm がアンマウントされ、
  // 失敗して戻ってきたときには別のインスタンスになるため。
  const [entryError, setEntryError] = useState('');
  const [message, setMessage] = useState('');
  const [windowRows, setWindowRows] = useState(30);
  const [showRanking, setShowRanking] = useState(false);
  // ランキングは表示用ログ (直近分) ではなくサーバー集計の全期間分を、開いたときに取る
  const roomRanking = useRoomRanking(roomId, showRanking);

  useLookSound(roomId);

  const handleExit = () => {
    // 保存を待つ前に入力欄と表示状態を同期で戻してから退室する（退室操作は即座に反映させる）。
    // 退室メッセージの名前はこのレンダーの identity の値なので、戻した後でも変わらない
    setShowRanking(false);
    setName('');
    setMessage('');
    return session.exit();
  };

  const handleSend = (msg: string, metadata?: ChatMetadata) => {
    // 発言もコマンド（「消す」ボタンの clear を含む）も、送信した時点で入力欄を空にしてログ表示へ戻す
    if (msg.trim()) {
      setMessage('');
      setShowRanking(false);
    }
    return session.send(msg, metadata);
  };

  return (
    <main className="flex min-h-dvh h-dvh flex-col overflow-hidden bg-yui-green" role="main">
      <header className="sr-only">
        <h1>{room.title}</h1>
        <p>{room.description}</p>
      </header>
      <RetroSplitter
        minTop={100}
        minBottom={100}
        topKind={entered ? 'chat' : 'entry'}
        top={
          entered ? (
            <ChatRoom
              message={message}
              setMessage={setMessage}
              windowRows={windowRows}
              setWindowRows={(rows) => {
                setWindowRows(rows);
                // 100 件を超える行数を選んだら、その件数まで取得を広げる
                expand(rows);
              }}
              windowRowOptions={getWindowRowOptions(roomId)}
              onExit={handleExit}
              onSend={handleSend}
              onReload={reload}
              onShowRanking={() => setShowRanking(true)}
              onBackToChat={() => setShowRanking(false)}
              avatar={avatar}
              userName={name}
              userColor={color}
            />
          ) : (
            <>
              <EntryForm
                roomTitle={room.title}
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
                  // 初期表示は 10 件に絞っている。入室したらログを全件へ広げる
                  expand(FULL_CHAT_LOG_LIMIT);
                  try {
                    await session.enter({ name: n, color: c, silent });
                  } catch (err) {
                    setEntryError(toEntryErrorMessage(err));
                    throw err;
                  }
                }}
              />
              <RoomInfo roomId={roomId} />
            </>
          )
        }
        bottom={
          !showRanking ? (
            <Suspense
              fallback={
                <div className="mt-8 animate-pulse text-gray-400">チャットログを読み込み中...</div>
              }
            >
              <ChatLogList
                chatLog={chatLog}
                isLoading={isLoading}
                windowRows={windowRows}
                loadError={loadError}
                onRetry={reload}
              />
            </Suspense>
          ) : (
            <div className="px-[var(--page-gap)] pb-[var(--page-gap)]">
              {/* レガシーに合わせ、戻る導線は見出しの部屋名リンクが担う
                  （更新・発言ボタンからもチャット表示に戻れる） */}
              <ChatRanking
                ranking={roomRanking.ranking}
                isLoading={roomRanking.isLoading}
                hasError={roomRanking.hasError}
                roomTitle={room.title}
                onBackToChat={() => setShowRanking(false)}
              />
            </div>
          )
        }
      />
    </main>
  );
}
