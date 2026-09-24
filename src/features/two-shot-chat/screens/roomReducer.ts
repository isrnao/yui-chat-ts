import type { ErrorCode, RoomView, Sex } from '../../../../supabase/functions/two-shot/rules.ts';
import { sessionStore, type ActiveSession } from '../api/sessionStore';
import { callTwoShot } from '../api/twoShotApi';
import type { AutoSeconds } from '../config';
import type { TwoShotRequest } from '../protocol';

type LogBottom = { kind: 'log'; view: RoomView };
type Bottom = LogBottom | { kind: 'notice'; code: ErrorCode };

export type RoomUiState = {
  seat: 0 | 1;
  me: { name: string; sex: Sex };
  bottom: Bottom;
  /** 〔直前の画面〕の戻り先（直前のログ）。お知らせが続いても上書きしない */
  previous: LogBottom | null;
  auto: AutoSeconds;
  /** 退室・閉鎖・失効のあと。直前の画面に戻しても自動更新は再開しない */
  terminal: boolean;
};

export type RoomAction =
  | { type: 'read' }
  | { type: 'say'; text: string }
  | { type: 'setAuto'; auto: AutoSeconds }
  | { type: 'clear' | 'kick' | 'leave' | 'close' | 'back' };

/** これらのお知らせのあとは、そのトークンでは操作できない */
const TERMINAL: readonly ErrorCode[] = ['E3', 'E4', 'E6', 'E7', 'E8'];

function toRequest(roomId: string, action: RoomAction): TwoShotRequest {
  switch (action.type) {
    case 'say':
      return { room: roomId, op: 'say', text: action.text };
    case 'clear':
    case 'kick':
    case 'leave':
    case 'close':
      return { room: roomId, op: action.type };
    default:
      return { room: roomId, op: 'read' };
  }
}

/**
 * 入室後の操作の reducer（Action）。サーバーの応答を次の画面の状態にする。
 * useActionState は Action を届いた順に 1 つずつ処理するので、応答の順序が入れ替わらない。
 * spec: design.md §8「入室後の操作」
 */
export async function reduceRoom(
  session: ActiveSession,
  previous: RoomUiState,
  action: RoomAction,
  call: typeof callTwoShot = callTwoShot
): Promise<RoomUiState> {
  if (action.type === 'back') {
    // 直前のログがなければ（復元に失敗したときなど）取り直す
    if (previous.previous === null) return reduceRoom(session, previous, { type: 'read' }, call);
    return { ...previous, bottom: previous.previous };
  }
  const base: RoomUiState =
    action.type === 'setAuto'
      ? { ...previous, auto: action.auto }
      : // 相手を退室させるときは、自動更新を「なし」に戻してから送る（原作の message2()）
        action.type === 'kick'
        ? { ...previous, auto: 0 }
        : previous;

  const result = await call(toRequest(session.roomId, action), session.token);
  // 待っている間に Session を離れていたら、何も変えない
  if (sessionStore.getSnapshot()?.token !== session.token) return previous;

  const lastLog = previous.bottom.kind === 'log' ? previous.bottom : previous.previous;
  if (result === 'failed' || (result.ok && result.screen === 'lobby')) {
    return { ...base, bottom: { kind: 'notice', code: 'E12' }, previous: lastLog };
  }
  if (result.ok) {
    return {
      ...base,
      seat: result.room.seat,
      me: result.room.me,
      bottom: { kind: 'log', view: result.room },
      previous: null,
      terminal: false,
    };
  }
  const terminal = previous.terminal || TERMINAL.includes(result.notice);
  return {
    ...base,
    auto: terminal ? 0 : base.auto,
    bottom: { kind: 'notice', code: result.notice },
    previous: lastLog,
    terminal,
  };
}
