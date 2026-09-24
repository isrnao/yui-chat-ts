import { startTransition, useActionState, useRef, useState, useSyncExternalStore } from 'react';
import { isSex, type ErrorCode, type Sex } from '../../../../supabase/functions/two-shot/rules.ts';
import { buildChatRoomPath } from '@features/chat/routing';
import { entryStore } from '../api/entryStore';
import { lobbyStore } from '../api/lobbyStore';
import { seedRoomResource } from '../api/roomResource';
import { sessionStore, type PendingSession } from '../api/sessionStore';
import { createEntryToken } from '../api/token';
import { callTwoShot } from '../api/twoShotApi';
import EntryForm, { type EntryValues } from '../components/EntryForm';
import FrameLayout from '../components/FrameLayout';
import NoticePage from '../components/NoticePage';
import RoomList from '../components/RoomList';
import TwoShotScope from '../components/Scope';
import { TWO_SHOT_CONFIG } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { EnterRequest } from '../protocol';

type LobbyUi = { kind: 'lobby' } | { kind: 'notice'; code: ErrorCode };
type LobbyAction = { type: 'enter'; formData: FormData } | { type: 'dismiss' };

const HOME_HREF = import.meta.env.BASE_URL;
const REPORT_HREF = buildChatRoomPath('com_sb');

function sameRequest(a: EnterRequest, b: EnterRequest): boolean {
  return (
    a.room === b.room &&
    a.name === b.name &&
    a.sex === b.sex &&
    a.profile === b.profile &&
    a.make === b.make
  );
}

function readRequest(formData: FormData): EnterRequest {
  const sex = formData.get('sex');
  return {
    room: String(formData.get('room') ?? ''),
    name: String(formData.get('chat_name') ?? ''),
    sex: isSex(sex) ? sex : '-',
    profile: String(formData.get('mes') ?? ''),
    make: formData.has('make'),
  };
}

/**
 * 入室の Action（原作の action=entry）。spec: design.md §8「入室（LobbyScreen の Action）」
 *
 * 1. 部屋を選んでいなければ通信せずに E1
 * 2. 新しい試行ならトークンを作り、要求と一緒にタブへ保存してから送る。同じ入力の保留中の試行があれば、
 *    同じトークンで再送する（応答を受け取れなかった入室から復帰する）
 * 3. 成功したら、応答のログを初期表示に渡してから active にする（入室の直後に取り直さない）
 * 4. 通信の失敗は保留を残して E12。満室・E2・失効（E4）は保留を消す。満室は入力を残して一覧を取り直す
 */
async function enter(formData: FormData): Promise<LobbyUi> {
  const request = readRequest(formData);
  if (formData.has('cookie')) {
    entryStore.update({ name: request.name, sex: request.sex, profile: request.profile });
  } else {
    entryStore.update(null);
  }
  if (request.room === '') return { kind: 'notice', code: 'E1' };

  const current = sessionStore.getSnapshot();
  let token: string;
  if (current?.status === 'pending' && sameRequest(current.request, request)) {
    token = current.token;
  } else {
    try {
      token = createEntryToken(Date.now());
    } catch {
      return { kind: 'notice', code: 'E12' };
    }
    sessionStore.set({ status: 'pending', token, request });
  }

  const result = await callTwoShot({ op: 'enter', ...request }, token);
  // 待っている間に別の試行や入室に変わっていたら、この応答では何も変えない
  if (sessionStore.getSnapshot()?.token !== token) return { kind: 'lobby' };
  if (result === 'failed') return { kind: 'notice', code: 'E12' };
  if (result.ok && result.screen === 'room') {
    seedRoomResource(token, result.room);
    sessionStore.set({
      status: 'active',
      token,
      roomId: request.room,
      seat: result.room.seat,
      me: result.room.me,
    });
    return { kind: 'lobby' };
  }
  sessionStore.clearIfToken(token);
  if (result.ok) {
    // 満室: 何も出さずに入口へ戻り、一覧を取り直す（原作の First）
    lobbyStore.reload();
    return { kind: 'lobby' };
  }
  return { kind: 'notice', code: result.notice };
}

/**
 * 入口（原作の First: 上に入室フォーム、下に空室状況）。入室の失敗はページ全体のお知らせにする。
 */
export default function LobbyScreen({ pending }: { pending: PendingSession | null }) {
  const saved = useSyncExternalStore(
    entryStore.subscribe,
    entryStore.getSnapshot,
    entryStore.getServerSnapshot
  );
  const lobby = useSyncExternalStore(
    lobbyStore.subscribe,
    lobbyStore.getSnapshot,
    lobbyStore.getServerSnapshot
  );
  const [lobbyAuto, setLobbyAuto] = useState(false);

  // 入力は、未編集ならストア（保留中の試行 > 保存値 > 既定）に追随し、編集したらその値を保つ。
  // 入室に失敗しても、満室で入口に戻っても、名前や選んだ部屋は残る
  const stored: EntryValues = {
    name: pending?.request.name ?? saved?.name ?? '',
    sex: pending?.request.sex ?? saved?.sex ?? ('-' satisfies Sex),
    room: pending?.request.room ?? '',
    profile: pending?.request.profile ?? saved?.profile ?? '',
    save: true,
  };
  const [edited, setEdited] = useState<Partial<EntryValues>>({});
  const values: EntryValues = { ...stored, ...edited };

  const busy = useRef(false);
  const [ui, dispatch] = useActionState(
    async (_previous: LobbyUi, action: LobbyAction): Promise<LobbyUi> => {
      if (action.type === 'dismiss') return { kind: 'lobby' };
      // React Compiler は catch のない try / finally をコンパイルできないので、Promise の finally で戻す
      return enter(action.formData).finally(() => {
        busy.current = false;
      });
    },
    { kind: 'lobby' }
  );

  useAutoRefresh(TWO_SHOT_CONFIG.lobbyReloadSeconds, lobbyStore.reload, lobbyAuto);

  if (ui.kind === 'notice') {
    const dismiss = () => {
      startTransition(() => dispatch({ type: 'dismiss' }));
      lobbyStore.reload();
    };
    // 〔直前の画面〕は保留中の試行を残し、同じ入力の〔入室〕で同じトークンを再送できるようにする。
    // 〔空室状況へ〕は試行を破棄する（design.md §8 入室の 5。残すと、前回の席が失効していたときに空室でも E4 になる）
    const toLobby = () => {
      if (pending !== null) sessionStore.clearIfToken(pending.token);
      dismiss();
    };
    return (
      <TwoShotScope className="ts-page">
        <NoticePage code={ui.code} onLobby={toLobby} onBack={dismiss} homeHref={HOME_HREF} />
      </TwoShotScope>
    );
  }

  return (
    <FrameLayout
      initialTopPercent={TWO_SHOT_CONFIG.frames.lobby}
      topLabel="入室フォーム"
      bottomLabel="空室状況"
      top={
        <EntryForm
          // 保存値は hydration の後に届く。届いたらフォーカスの位置を決め直すため作り直す
          key={saved?.name ? 'profile' : 'name'}
          values={values}
          onChange={(patch) => setEdited((previous) => ({ ...previous, ...patch }))}
          action={(formData) => {
            // 実行中の二重送信は受け付けない
            if (busy.current) return;
            busy.current = true;
            dispatch({ type: 'enter', formData });
          }}
          focus={saved?.name ? 'profile' : 'name'}
        />
      }
      bottom={
        <RoomList
          lobby={lobby}
          auto={lobbyAuto}
          onReload={lobbyStore.reload}
          onSetAuto={(auto) => {
            setLobbyAuto(auto);
            if (auto) lobbyStore.reload();
          }}
          homeHref={HOME_HREF}
          reportHref={REPORT_HREF}
        />
      }
    />
  );
}
