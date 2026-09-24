import { startTransition, useActionState, useRef, useState, useSyncExternalStore } from 'react';
import { lobbyStore } from '../api/lobbyStore';
import { getRoomResource } from '../api/roomResource';
import { sessionStore, type ActiveSession } from '../api/sessionStore';
import ChatForm from '../components/ChatForm';
import ChatLog from '../components/ChatLog';
import FrameLayout from '../components/FrameLayout';
import NoticePage from '../components/NoticePage';
import { getTwoShotRoomName, TWO_SHOT_CONFIG } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { reduceRoom, type RoomAction, type RoomUiState } from './roomReducer';

const HOME_HREF = import.meta.env.BASE_URL;

/** 空室状況へ戻る（Session を消すとページは入口を出す） */
function backToLobby(token: string) {
  sessionStore.clearIfToken(token);
  lobbyStore.reload();
}

/**
 * 入室後の画面（原作の InForm: 上に入力画面、下にログ）。
 */
function RoomScreen({ session, initial }: { session: ActiveSession; initial: RoomUiState }) {
  const [value, setValue] = useState('');
  const busy = useRef(false);
  const [ui, dispatchAction] = useActionState(
    (previous: RoomUiState, action: RoomAction): Promise<RoomUiState> =>
      reduceRoom(session, previous, action)
        .then((next) => {
          // 発言が保存されてログが返ったら発言欄を空にする。原作は文字を残して全選択したが、Enter のたびに
          // 同じ発言を連投してしまうため変えた（requirements.md 6.4）。送れなかったとき（お知らせ）は残して
          // 送り直せるようにし、応答を待つ間に書き足した文字は消さない
          if (action.type === 'say' && next.bottom.kind === 'log') {
            setValue((current) => (current === action.text ? '' : current));
          }
          return next;
        })
        // React Compiler は catch のない try / finally をコンパイルできないので、Promise の finally で戻す
        .finally(() => {
          busy.current = false;
        }),
    initial
  );

  // 操作は 1 つずつ送る。実行中に届いた操作（発言の連打・自動更新の tick）は捨て、後でまとめて送らない
  // （design.md §8。ためると、応答を待つ間に押し直した発言が完了後にもう一度送られる）
  const dispatch = (action: RoomAction) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(() => dispatchAction(action));
  };

  // 自動更新はログを表示している間だけ
  useAutoRefresh(
    ui.auto,
    () => dispatch({ type: 'read' }),
    ui.bottom.kind === 'log' && !ui.terminal && ui.auto > 0
  );

  const roomName = getTwoShotRoomName(session.roomId);
  return (
    <FrameLayout
      initialTopPercent={TWO_SHOT_CONFIG.frames.room}
      topLabel="入力画面"
      bottomLabel="ログ"
      top={
        <ChatForm
          roomName={roomName}
          me={ui.me}
          seat={ui.seat}
          value={value}
          onValueChange={setValue}
          auto={ui.auto}
          // 空の発言は取り直しと同じ（原作も Value が空なら書かない）
          onSay={(text) => dispatch(text === '' ? { type: 'read' } : { type: 'say', text })}
          onReload={() => dispatch({ type: 'read' })}
          onSetAuto={(auto) => dispatch({ type: 'setAuto', auto })}
          onClose={() => dispatch({ type: 'close' })}
          onKick={() => dispatch({ type: 'kick' })}
          onLeave={() => dispatch({ type: 'leave' })}
        />
      }
      bottom={
        ui.bottom.kind === 'log' ? (
          <ChatLog
            view={ui.bottom.view}
            auto={ui.auto}
            onClear={() => dispatch({ type: 'clear' })}
          />
        ) : (
          <NoticePage
            code={ui.bottom.code}
            onLobby={() => backToLobby(session.token)}
            onBack={() => dispatch({ type: 'back' })}
            homeHref={HOME_HREF}
          />
        )
      }
    />
  );
}

/**
 * 入室後の初期表示を読み、揃ったら RoomScreen を 1 回だけ作る。
 * 初期取得の間は空のフレームを出す。通信に失敗したら、保存した me で上ペインを出し、下ペインに E12 を出す。
 */
export default function RoomRestoreBoundary({ session }: { session: ActiveSession }) {
  const resource = getRoomResource(session);
  const initial = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getServerSnapshot
  );

  if (initial.kind === 'loading' || initial.kind === 'invalid') {
    return (
      <FrameLayout
        initialTopPercent={TWO_SHOT_CONFIG.frames.room}
        topLabel="入力画面"
        bottomLabel="ログ"
        top={null}
        bottom={null}
      />
    );
  }
  const state: RoomUiState =
    initial.kind === 'ready'
      ? {
          seat: initial.view.seat,
          me: initial.view.me,
          bottom: { kind: 'log', view: initial.view },
          previous: null,
          auto: 0,
          terminal: false,
        }
      : {
          seat: session.seat,
          me: session.me,
          bottom: { kind: 'notice', code: 'E12' },
          previous: null,
          auto: 0,
          terminal: false,
        };
  return <RoomScreen session={session} initial={state} />;
}
