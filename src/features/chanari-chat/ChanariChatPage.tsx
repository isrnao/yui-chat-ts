import { useState, lazy, Suspense } from 'react';
import type { RoomId } from '@features/chat/rooms';
import { getRoomMeta } from '@features/chat/rooms';
import { getRoomLogStore, FULL_CHAT_LOG_LIMIT } from '@features/chat/api/roomLogStore';
import { useRoomLog } from '@features/chat/hooks/useRoomLog';
import { useChatIdentity } from '@features/chat/hooks/useChatIdentity';
import { useChatSession } from '@features/chat/hooks/useChatSession';
import RealtimeStatusNotice from '@features/chat/components/RealtimeStatusNotice';
import { useLookSound } from '@features/chat/hooks/useLookSound';
import { useStoreBackedState } from '@shared/hooks/useStoreBackedState';
import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { buildPageTitle } from '@shared/utils/seo';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import { normalizeColorCode } from './utils/colorCode';
import ChanariTopHeader from './components/ChanariTopHeader';
import ChanariEntryForm from './components/ChanariEntryForm';
import ChanariChatRoom from './components/ChanariChatRoom';
import { useVisibleInterval } from '@shared/hooks/useVisibleInterval';
import { useChanariSettings } from './hooks/useChanariSettings';
import { loadDraft, DEFAULT_RELOAD_SECONDS } from './utils/draftStore';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';
import { toEntryErrorMessage } from '@features/chat/utils/entryError';
import './styles/chanari.css';
import { CHANARI_TEXTS } from './chanariTexts';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

export default function ChanariChatPage({ roomId }: { roomId: RoomId }) {
  const room = getRoomMeta(roomId);
  // /chanari/<id> は /chat/<id> と内容が重複するため canonical を通常チャット側に
  // 向けて評価を集約する (sitemap 除外と同じ canonical 化方針。
  // .kiro/specs/seo-improvement design §3)。従来は index.html の canonical "/" を
  // 引き継ぎ「トップの複製」を自己申告する状態だった (SEO-02)
  const pageTitle = buildPageTitle(`${room.title}${CHANARI_TEXTS.titleSuffix}`);
  useSEO({
    title: pageTitle,
    description: room.description,
    canonical: buildRoomSeo(roomId).canonical,
  });
  usePageView(pageTitle);

  const measurement = useConversationMeasurement();
  const store = getRoomLogStore(roomId);
  const { chatLog, isLoading, loadError, realtimeStatus, addOptimistic, reload, expand } =
    useRoomLog(store, measurement.onRealtimeChat);
  useLookSound(store);

  const { settings, updateSettings } = useChanariSettings(roomId);
  // 入室の失敗は ChanariEntryForm ではなくここで持つ（入室中はフォームがアンマウントされるため）
  const [entryError, setEntryError] = useState('');
  // SSG/hydration 中は既定値、hydration 後は draft 由来の値に追随する
  const identity = useChatIdentity({ name: settings.name, color: settings.nameColor });
  const { name, setName, color: nameColor, setColor: setNameColor } = identity;
  const [speechColor, setSpeechColor] = useStoreBackedState(settings.speechColor ?? '#000000');
  const [initialMessage, setInitialMessage] = useState('');
  const [entryCount, setEntryCount] = useState(0);
  const windowRows = 30;
  const [reloadSeconds, setReloadSeconds] = useState<number>(DEFAULT_RELOAD_SECONDS);

  const session = useChatSession({
    target: { kind: 'room', roomId },
    identity: { name, color: nameColor, email: '' },
    store,
    addOptimistic,
    measurement,
  });
  const { entered } = session;

  const handleExit = () => {
    // 保存を待つ前に入力欄と表示状態を同期で戻してから退室する（退室操作は即座に反映させる）。
    // 退室メッセージの名前はこのレンダーの identity の値なので、戻した後でも変わらない
    setName('');
    return session.exit();
  };

  // 発言もログ消去（clear）も、送信した時点で入力欄を空にする
  const handleSend = (msg: string) => {
    return session.send(msg);
  };

  // レガシー互換の定期更新は Realtime が切れている間のフォールバックとしてのみ動かす。
  // 接続中は push で新着が届くため、ポーリングしても取得済みの内容を取り直すだけになる
  // (既定 7 秒間隔なので 1 人あたり毎時 500 回を超える無駄な問い合わせになっていた)。
  useVisibleInterval(reloadSeconds, reload, entered && realtimeStatus === 'disconnected');

  return (
    <main className="flex min-h-dvh h-dvh flex-col overflow-hidden chanari-page-bg" role="main">
      <RealtimeStatusNotice status={realtimeStatus} />
      <RetroSplitter
        minTop={100}
        minBottom={100}
        top={
          <div className="chanari-container">
            <div className="chanari-scope">
              <ChanariTopHeader
                backHref={import.meta.env.BASE_URL}
                title={room.title}
                description={room.description}
                sloganLabel={CHANARI_TEXTS.slogan}
              />
              {entered ? (
                <ChanariChatRoom
                  initialMessage={initialMessage}
                  onSaveDraft={(lastMessage) => updateSettings({ lastMessage })}
                  onSend={(msg) => handleSend(msg)}
                  onReload={reload}
                  onExit={handleExit}
                  onClearMyLogs={() => handleSend('clear')}
                  nameColor={nameColor}
                  setNameColor={(value) => {
                    setNameColor(value);
                    session.updateIdentity({ color: normalizeColorCode(value, '#ff69b4') });
                  }}
                  speechColor={speechColor}
                  setSpeechColor={setSpeechColor}
                  reloadSeconds={reloadSeconds}
                  setReloadSeconds={setReloadSeconds}
                  onRestoreDraft={() => loadDraft(roomId)?.lastMessage ?? ''}
                  isPending={session.phase === 'entering' || session.isSending}
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
                  isPending={session.phase === 'exiting'}
                  error={entryError}
                  onEnter={async ({ name: n, nameColor: nc, speechColor: sc }) => {
                    setInitialMessage(
                      entryCount === 0 ? (loadDraft(roomId)?.lastMessage ?? '') : ''
                    );
                    updateSettings({ name: n, nameColor: nc, speechColor: sc });
                    setEntryError('');
                    // 初期表示は 10 件に絞っている。入室したらログを全件へ広げる
                    expand(FULL_CHAT_LOG_LIMIT);
                    try {
                      await session.enter({ name: n, color: nc, silent: false });
                      setEntryCount((count) => count + 1);
                    } catch (err) {
                      setEntryError(toEntryErrorMessage(err));
                      throw err;
                    }
                  }}
                />
              )}
            </div>
          </div>
        }
        bottom={
          <Suspense
            fallback={
              <div className="mt-8 animate-pulse text-gray-400">チャットログを読み込み中...</div>
            }
          >
            <ChatLogList
              contained
              chatLog={chatLog}
              isLoading={isLoading}
              windowRows={windowRows}
              loadError={loadError}
              onRetry={reload}
            />
          </Suspense>
        }
      />
    </main>
  );
}
