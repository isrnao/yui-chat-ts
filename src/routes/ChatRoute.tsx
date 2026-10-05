import {
  Activity,
  ViewTransition,
  addTransitionType,
  startTransition,
  useState,
  lazy,
  Suspense,
} from 'react';
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
import FilterPanel from '@features/chat/components/FilterPanel';
import { useIpFilter } from '@features/chat/hooks/useIpFilter';
import { filterByIp } from '@features/chat/utils/ipFilter';
import { useRoomRanking } from '@features/chat/hooks/useRoomRanking';
import type { ChatMetadata } from '@features/chat/types';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import { getWindowRowOptions } from '@features/chat/utils/windowRows';
import { buildRoomSeo } from '@shared/utils/roomSeo';
import { useConversationMeasurement } from '@features/chat/hooks/useConversationMeasurement';
import { toEntryErrorMessage } from '@features/chat/utils/entryError';

const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

/**
 * 下段の切り替え（ランキングとフィルタの開閉）だけをアニメーションする。<ViewTransition> は既定では
 * Suspense の中身が現れたときにも View Transition を始めるので、ページを開いた直後（ログ一覧のチャンクの
 * 読み込み完了時）にも動いていた。ページ間の遷移（ドキュメント間の View Transitions）の最中にそれが始まると
 * ブラウザが片方を省き、省かれた側の Promise が未処理の AbortError（Transition was skipped）として報告されていた。
 * 開閉の Transition にだけ型を付け、その型のときだけ有効にする
 */
const RANKING_TRANSITION = 'ranking';
const FILTER_TRANSITION = 'filter';
const PANEL_ONLY = { [RANKING_TRANSITION]: 'auto', [FILTER_TRANSITION]: 'auto', default: 'none' };

/** 下段に出すもの。ログ・ランキング・フィルタの編集画面のどれか 1 つ */
type BottomPanel = 'log' | 'ranking' | 'filter';

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
  const [windowRows, setWindowRows] = useState(30);
  const [panel, setPanel] = useState<BottomPanel>('log');
  const showRanking = panel === 'ranking';
  // [ランキング] と「フィルタ」のリンク、それぞれの見出しから戻るリンクは Transition で開閉し、
  // ViewTransition でアニメーションする。発言の送信や「更新」で閉じるときは Transition にしない。
  // 送信は Action（非同期の Transition）なので、同じイベントの Transition の更新は Action に束ねられ、
  // 保存が終わるまでランキングが閉じなくなる（テストで確認済み）
  const switchPanelAnimated = (type: string, next: BottomPanel) =>
    startTransition(() => {
      addTransitionType(type);
      setPanel(next);
    });
  const openRanking = () => switchPanelAnimated(RANKING_TRANSITION, 'ranking');
  const closeRankingAnimated = () => switchPanelAnimated(RANKING_TRANSITION, 'log');
  // 「フィルタ」は開いているときにもう一度押すとログへ戻る（chat-ip-mute Requirement 4.4）
  const toggleFilter = () =>
    switchPanelAnimated(FILTER_TRANSITION, panel === 'filter' ? 'log' : 'filter');
  const closeFilterAnimated = () => switchPanelAnimated(FILTER_TRANSITION, 'log');
  const backToLog = () => setPanel('log');
  // ランキングは表示用ログ (直近分) ではなくサーバー集計の全期間分を、開いたときに取る
  const roomRanking = useRoomRanking(roomId, showRanking);
  // フィルタした伏せ字の IP（chat-ip-mute）。編集画面の件数はログ一覧と同じ純粋関数で数える
  const ipFilter = useIpFilter();
  const { hiddenCounts, hiddenNames } = filterByIp(chatLog, ipFilter.set);

  useLookSound(roomId);

  const handleExit = () => {
    // 保存を待つ前に入力欄と表示状態を同期で戻してから退室する（退室操作は即座に反映させる）。
    // 退室メッセージの名前はこのレンダーの identity の値なので、戻した後でも変わらない
    setPanel('log');
    setName('');
    return session.exit();
  };

  const handleSend = (msg: string, metadata?: ChatMetadata) => {
    // 発言もコマンド（「消す」ボタンの clear を含む）も、送信した時点でログ表示へ戻す
    // （入力欄は ChatRoom が自分で空にする）
    if (msg.trim()) backToLog();
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
              onShowRanking={openRanking}
              onBackToChat={backToLog}
              filterCount={ipFilter.ips.length}
              onToggleFilter={toggleFilter}
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
          <>
            {/* ランキングやフィルタを表示している間もログ一覧は Activity で残しておく。戻ったときに
                再マウントせず（1000 行でも作り直さない）、スクロール位置もそのまま戻る。
                スクロールは各ビューが自分の枠で持つ（下段の枠を共有すると、ランキングの
                高さに合わせてスクロール量が変わってしまう） */}
            <Activity mode={panel === 'log' ? 'visible' : 'hidden'}>
              <ViewTransition default={PANEL_ONLY}>
                <div className="h-full overflow-y-auto" data-testid="chat-log-pane">
                  <Suspense
                    fallback={
                      <div className="mt-8 animate-pulse text-gray-400">
                        チャットログを読み込み中...
                      </div>
                    }
                  >
                    <ChatLogList
                      chatLog={chatLog}
                      isLoading={isLoading}
                      windowRows={windowRows}
                      loadError={loadError}
                      onRetry={reload}
                      ipFilter={ipFilter}
                    />
                  </Suspense>
                </div>
              </ViewTransition>
            </Activity>
            {showRanking && (
              <ViewTransition default={PANEL_ONLY}>
                <div className="h-full overflow-y-auto px-[var(--page-gap)] pb-[var(--page-gap)]">
                  {/* レガシーに合わせ、戻る導線は見出しの部屋名リンクが担う
                      （更新・発言ボタンからもチャット表示に戻れる） */}
                  <ChatRanking
                    ranking={roomRanking.ranking}
                    isLoading={roomRanking.isLoading}
                    hasError={roomRanking.hasError}
                    roomTitle={room.title}
                    onBackToChat={closeRankingAnimated}
                  />
                </div>
              </ViewTransition>
            )}
            {panel === 'filter' && (
              <ViewTransition default={PANEL_ONLY}>
                <div className="h-full overflow-y-auto px-[var(--page-gap)] pb-[var(--page-gap)]">
                  <FilterPanel
                    ips={ipFilter.ips}
                    hiddenCounts={hiddenCounts}
                    hiddenNames={hiddenNames}
                    onBack={closeFilterAnimated}
                  />
                </div>
              </ViewTransition>
            )}
          </>
        }
      />
    </main>
  );
}
