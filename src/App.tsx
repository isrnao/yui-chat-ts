import { useState, useRef, lazy, Suspense, useId, useEffect } from 'react';
import { useChatLog } from '@features/chat/hooks/useChatLog';
import { useParticipants } from '@features/chat/hooks/useParticipants';
import { useChatHandlers } from '@features/chat/hooks/useChatHandlers';
import { useLookSound } from '@features/chat/hooks/useLookSound';
import { useSEO, usePageView } from '@shared/hooks/useSEO';
import { preloadCriticalResources, earlyDataFetch } from '@features/chat/hooks/usePreloadChatLogs';
import ChatRoom from '@features/chat/components/ChatRoom';
import EntryForm from '@features/chat/components/EntryForm';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import ChatRanking from '@features/chat/components/ChatRanking';
import type { AvatarId } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { buildChatRoomPath, matchRoute } from '@features/chat/routing';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import TopPage from '@features/top/TopPage';
import NotFoundPage from './pages/NotFoundPage';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

function ChatPage({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);

  useEffect(() => {
    preloadCriticalResources();
    earlyDataFetch(roomId);
  }, [roomId]);

  useSEO({
    title: `${room.title} | ゆいちゃっとTS`,
    description: `${room.title}をブラウザですぐに使えるお気楽チャットとして公開しています。`,
    keywords: ['ゆいちゃっとTS', 'お気楽チャット', '無料チャット', room.title],
    canonical: `https://isrnao.github.io${buildChatRoomPath(roomId)}`,
  });

  usePageView(`${room.title} - ゆいちゃっとTS`);

  const { chatLog, isLoading, setChatLog, addOptimistic, mergeChat } = useChatLog(roomId);
  const participants = useParticipants(chatLog);
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff69b4');
  const [message, setMessage] = useState('');
  const [windowRows, setWindowRows] = useState(30);
  const [showRanking, setShowRanking] = useState(false);
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>('none');
  const myId = useId();

  const channelRef = useRef<RealtimeChannel | null>(null);
  useLookSound(channelRef, roomId);

  const { handleEnter, handleExit, handleSend, handleReload } = useChatHandlers({
    roomId,
    name,
    color,
    email,
    myId,
    entered,
    setEntered,
    setChatLog,
    setShowRanking,
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
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
        top={
          entered ? (
            <ChatRoom
              message={message}
              setMessage={setMessage}
              chatLog={chatLog}
              windowRows={windowRows}
              setWindowRows={setWindowRows}
              onExit={handleExit}
              onSend={(msg, metadata) => handleSend(msg, metadata)}
              onReload={handleReload}
              onShowRanking={() => setShowRanking(true)}
              avatar={avatar}
              userName={name}
            />
          ) : (
            <EntryForm
              roomTitle={room.title}
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
                participants={participants}
              />
            </Suspense>
          ) : (
            <div className="relative px-[var(--page-gap)] pb-[var(--page-gap)]">
              <button
                className="absolute right-0 top-0 px-2 py-1 text-xs text-blue-700 underline"
                onClick={() => setShowRanking(false)}
              >
                戻る
              </button>
              <ChatRanking chatLog={chatLog} />
            </div>
          )
        }
      />
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => matchRoute(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      setRoute(matchRoute(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (route.type !== 'redirect') return;

    window.history.replaceState(null, '', route.to);
    setRoute(matchRoute(window.location.pathname));
  }, [route]);

  if (route.type === 'not-found') {
    return <NotFoundPage />;
  }

  if (route.type === 'redirect') {
    return null;
  }

  if (route.type === 'top') {
    return <TopPage />;
  }

  return <ChatPage roomId={route.roomId} />;
}
