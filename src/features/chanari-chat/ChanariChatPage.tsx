import { useId, useRef, useState, lazy, Suspense } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RoomId } from '@features/chat/rooms';
import { getRoomMeta } from '@features/chat/rooms';
import { useChatLog } from '@features/chat/hooks/useChatLog';
import { useParticipants } from '@features/chat/hooks/useParticipants';
import { useChatHandlers } from '@features/chat/hooks/useChatHandlers';
import { useLookSound } from '@features/chat/hooks/useLookSound';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import ChanariTopHeader from './components/ChanariTopHeader';
import ChanariEntryForm from './components/ChanariEntryForm';
import ChanariChatRoom from './components/ChanariChatRoom';
import { useReloadInterval } from './hooks/useReloadInterval';
import { useChanariSettings } from './hooks/useChanariSettings';
import { DEFAULT_RELOAD_SECONDS } from './utils/draftStore';
import './styles/chanari.css';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

export default function ChanariChatPage({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);
  const myId = useId();

  const { chatLog, isLoading, setChatLog, addOptimistic, mergeChat } = useChatLog(roomId);
  const participants = useParticipants(chatLog);
  const channelRef = useRef<RealtimeChannel | null>(null);
  useLookSound(channelRef, roomId);

  const { settings, updateSettings } = useChanariSettings(roomId);
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState(settings.name ?? '');
  const [nameColor, setNameColor] = useState(settings.nameColor ?? '#ff69b4');
  const [speechColor, setSpeechColor] = useState(settings.speechColor ?? '#000000');
  const [message, setMessage] = useState(settings.lastMessage ?? '');
  const [windowRows] = useState(30);
  const [reloadSeconds, setReloadSeconds] = useState<number>(DEFAULT_RELOAD_SECONDS);

  const { handleEnter, handleExit, handleSend, handleReload } = useChatHandlers({
    roomId,
    name,
    color: nameColor,
    email: '',
    myId,
    entered,
    setEntered,
    setChatLog,
    setShowRanking: () => {},
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
  });

  useReloadInterval(reloadSeconds, handleReload, entered);

  return (
    <main className="flex min-h-dvh h-dvh flex-col overflow-hidden chanari-page-bg" role="main">
      <RetroSplitter
        minTop={100}
        minBottom={100}
        top={
          <div className="chanari-scope">
            <ChanariTopHeader
              backHref="https://chanari.com/"
              helpHref="https://chanari.com/help/"
              title={room.title}
              description={room.description}
              sloganLabel="ヽ(。д。)ﾉ常連さん募集中～！"
            />
            {entered ? (
              <ChanariChatRoom
                message={message}
                setMessage={setMessage}
                onSend={(msg) => handleSend(msg)}
                onReload={handleReload}
                onExit={handleExit}
                onClearMyLogs={() => handleSend('clear')}
                nameColor={nameColor}
                setNameColor={setNameColor}
                speechColor={speechColor}
                setSpeechColor={setSpeechColor}
                reloadSeconds={reloadSeconds}
                setReloadSeconds={setReloadSeconds}
                onRestoreDraft={() => setMessage(settings.lastMessage ?? '')}
                sid=""
              />
            ) : (
              <ChanariEntryForm
                name={name}
                setName={setName}
                nameColor={nameColor}
                setNameColor={setNameColor}
                speechColor={speechColor}
                setSpeechColor={setSpeechColor}
                sid=""
                onEnter={async ({ name: n, nameColor: nc, speechColor: sc }) => {
                  updateSettings({ name: n, nameColor: nc, speechColor: sc });
                  await handleEnter({ name: n, color: nc, email: '', silent: false });
                }}
              />
            )}
          </div>
        }
        bottom={
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
        }
      />
    </main>
  );
}
