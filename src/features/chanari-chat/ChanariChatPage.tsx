import { useState, lazy, Suspense } from 'react';
import type { RoomId } from '@features/chat/rooms';
import { getRoomMeta } from '@features/chat/rooms';
import { useChatLog } from '@features/chat/hooks/useChatLog';
import { useChatHandlers } from '@features/chat/hooks/useChatHandlers';
import { useLookSound } from '@features/chat/hooks/useLookSound';
import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { buildPageTitle } from '@shared/utils/seo';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import ChanariTopHeader from './components/ChanariTopHeader';
import ChanariEntryForm from './components/ChanariEntryForm';
import ChanariChatRoom from './components/ChanariChatRoom';
import { useReloadInterval } from './hooks/useReloadInterval';
import { useChanariSettings } from './hooks/useChanariSettings';
import { DEFAULT_RELOAD_SECONDS } from './utils/draftStore';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';
import './styles/chanari.css';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

export default function ChanariChatPage({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);
  // /chanari/<id> は /chat/<id> と内容が重複するため canonical を通常チャット側に
  // 向けて評価を集約する (sitemap 除外と同じ canonical 化方針。
  // .kiro/specs/seo-improvement design §3)。従来は index.html の canonical "/" を
  // 引き継ぎ「トップの複製」を自己申告する状態だった (SEO-02)
  const pageTitle = buildPageTitle(`${room.title}（なりきり）`);
  useSEO({
    title: pageTitle,
    description: room.description,
    canonical: buildRoomSeo(roomId).canonical,
  });
  usePageView(pageTitle);

  const measurement = useConversationMeasurement();
  const { chatLog, isLoading, setChatLog, addOptimistic, mergeChat, reload } = useChatLog(
    roomId,
    measurement.onRealtimeChat
  );
  useLookSound(roomId);

  const { settings, updateSettings } = useChanariSettings(roomId);
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState(settings.name ?? '');
  const [nameColor, setNameColor] = useState(settings.nameColor ?? '#ff69b4');
  const [speechColor, setSpeechColor] = useState(settings.speechColor ?? '#000000');
  const [message, setMessage] = useState(settings.lastMessage ?? '');
  const [windowRows] = useState(30);
  const [reloadSeconds, setReloadSeconds] = useState<number>(DEFAULT_RELOAD_SECONDS);

  const { handleEnter, handleExit, handleSend } = useChatHandlers({
    roomId,
    name,
    color: nameColor,
    email: '',
    setEntered,
    setChatLog,
    setShowRanking: () => {},
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
    measurement,
  });

  useReloadInterval(reloadSeconds, reload, entered);

  return (
    <main className="flex min-h-dvh h-dvh flex-col overflow-hidden chanari-page-bg" role="main">
      <RetroSplitter
        minTop={100}
        minBottom={100}
        top={
          <div className="chanari-scope">
            <ChanariTopHeader
              backHref={import.meta.env.BASE_URL}
              title={room.title}
              description={room.description}
              sloganLabel="ヽ(。д。)ﾉ常連さん募集中～！"
            />
            {entered ? (
              <ChanariChatRoom
                message={message}
                setMessage={setMessage}
                onSend={(msg) => handleSend(msg)}
                onReload={reload}
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
                  await handleEnter({ name: n, color: nc, silent: false });
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
            <ChatLogList chatLog={chatLog} isLoading={isLoading} windowRows={windowRows} />
          </Suspense>
        }
      />
    </main>
  );
}
