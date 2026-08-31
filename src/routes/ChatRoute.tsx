import { useState, lazy, Suspense } from 'react';
import { useChatLog } from '@features/chat/hooks/useChatLog';
import { useChatHandlers } from '@features/chat/hooks/useChatHandlers';
import { useLookSound } from '@features/chat/hooks/useLookSound';
import { useSettings } from '@features/chat/hooks/useSettings';
import { useSEO, usePageView } from '@shared/hooks/useSEO';
import ChatRoom from '@features/chat/components/ChatRoom';
import EntryForm from '@features/chat/components/EntryForm';
import RoomInfo from '@features/chat/components/RoomInfo';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import ChatRanking from '@features/chat/components/ChatRanking';
import type { AvatarId } from '@features/chat/types';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

export default function ChatRoute({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);

  // プリレンダ (scripts/prerender-rooms.ts) と同一ソースからメタを導出し、
  // 静的 HTML とランタイムのメタタグ不一致を防ぐ
  const seo = buildRoomSeo(roomId);
  useSEO(seo);
  usePageView(seo.title);

  const measurement = useConversationMeasurement();
  const { chatLog, isLoading, setChatLog, addOptimistic, mergeChat, reload } = useChatLog(
    roomId,
    measurement.onRealtimeChat
  );
  // localStorage に保存された前回入室時の設定をマウント時の初期値として読み出す
  // （以前は EntryForm 内 useEffect で sync していたが、effect 内 setState を避けるため初期化に移した）
  const { settings } = useSettings();
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState(() => settings.name ?? '');
  const [color, setColor] = useState(() => settings.color || '#ff69b4');
  const [message, setMessage] = useState('');
  const [windowRows, setWindowRows] = useState(30);
  const [showRanking, setShowRanking] = useState(false);
  const [email, setEmail] = useState(() => settings.email ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(() => settings.avatar ?? 'none');

  useLookSound(roomId);

  const { handleEnter, handleExit, handleSend } = useChatHandlers({
    roomId,
    name,
    color,
    email,
    setEntered,
    setChatLog,
    setShowRanking,
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
    measurement,
  });

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
              setWindowRows={setWindowRows}
              onExit={handleExit}
              onSend={(msg, metadata) => handleSend(msg, metadata)}
              onReload={reload}
              onShowRanking={() => setShowRanking(true)}
              onBackToChat={() => setShowRanking(false)}
              avatar={avatar}
              userName={name}
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
                onEnter={({ name: n, color: c, silent, avatar: a }) => {
                  setAvatar(a);
                  return handleEnter({ name: n, color: c, silent });
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
              <ChatLogList chatLog={chatLog} isLoading={isLoading} windowRows={windowRows} />
            </Suspense>
          ) : (
            <div className="px-[var(--page-gap)] pb-[var(--page-gap)]">
              {/* レガシーに合わせ、戻る導線は見出しの部屋名リンクが担う
                  （更新・発言ボタンからもチャット表示に戻れる） */}
              <ChatRanking
                chatLog={chatLog}
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
