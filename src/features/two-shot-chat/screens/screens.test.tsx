import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  applyCommand,
  emptyRoomState,
  toRoomView,
  type Command,
  type RoomState,
  type RoomView,
} from '../../../../supabase/functions/two-shot/rules.ts';
import type { TwoShotRequest, TwoShotResponse } from '../protocol';
import { sessionStore } from '../api/sessionStore';
import { createEntryToken } from '../api/token';
import TwoShotPage from '../TwoShotPage';
import { reduceRoom, type RoomUiState } from './roomReducer';

const api = vi.hoisted(() => ({
  callTwoShot:
    vi.fn<(request: TwoShotRequest, token: string | null) => Promise<TwoShotResponse | 'failed'>>(),
  fetchLobby: vi.fn(),
}));
vi.mock('../api/twoShotApi', () => ({ ...api, REQUEST_TIMEOUT_MS: 10_000 }));

const T0 = Date.UTC(2026, 8, 23, 21, 12, 0);

function run(steps: [string, Command][]): RoomState {
  let state = emptyRoomState();
  steps.forEach(([token, cmd], i) => {
    state = applyCommand(state, cmd, {
      roomId: '02',
      now: T0 + i,
      tokenHash: `h:${token}`,
      admission: null,
      requestHash: 'r',
      entryCreatedAt: T0,
      newMemberId: `m:${token}`,
      ip: token === 'a' ? '203.0.113.1' : '198.51.100.2',
      ua: 'UA',
    }).state;
  });
  return state;
}

const enterCmd = (name: string): Command => ({
  op: 'enter',
  name,
  sex: 'F',
  profile: '',
  make: false,
});
const ownerOnly = run([['a', enterCmd('はなこ')]]);
const view = (state: RoomState, seat: 0 | 1 = 0): RoomView => toRoomView('02', state, seat, T0);
const roomResponse = (state: RoomState, seat: 0 | 1 = 0): TwoShotResponse => ({
  ok: true,
  screen: 'room',
  room: view(state, seat),
});

function fillAndEnter(room = '02', button: '入室' | '開設' = '入室') {
  fireEvent.change(screen.getByRole('textbox', { name: 'チャット名' }), {
    target: { value: 'はなこ' },
  });
  fireEvent.click(screen.getByRole('radio', { name: '女' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'ルーム' }), { target: { value: room } });
  fireEvent.click(screen.getByRole('button', { name: button }));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  api.callTwoShot.mockReset();
  api.fetchLobby.mockReset().mockResolvedValue({ '01': { status: 'full' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('入口', () => {
  it('入室フォームと、取得した空室状況を出す', async () => {
    render(<TwoShotPage />);
    expect(screen.getByRole('heading', { name: 'ツーショットチャット' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('満室')).toBeInTheDocument());
    expect(api.fetchLobby).toHaveBeenCalledTimes(1);
  });

  it('部屋を選ばずに入室すると、通信せずにページ全体で E1 を出し、戻ると入力が残っている', async () => {
    render(<TwoShotPage />);
    await act(async () => fillAndEnter(''));
    expect(screen.getByRole('heading', { name: 'エラー' })).toBeInTheDocument();
    expect(screen.getByText('部屋を選択してください.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '空室状況' })).not.toBeInTheDocument();
    expect(api.callTwoShot).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '直前の画面' })));
    expect(screen.getByRole('textbox', { name: 'チャット名' })).toHaveValue('はなこ');
  });

  it('入室すると、応答のログで入室後の画面を出す（取り直さない）', async () => {
    api.callTwoShot.mockResolvedValueOnce(roomResponse(ownerOnly));
    render(<TwoShotPage />);
    await act(async () => fillAndEnter());
    await waitFor(() => expect(screen.getByRole('region', { name: 'ログ' })).toBeInTheDocument());
    const [request, token] = api.callTwoShot.mock.calls[0];
    expect(request).toEqual({
      op: 'enter',
      room: '02',
      name: 'はなこ',
      sex: 'F',
      profile: '',
      make: false,
    });
    expect(token).toMatch(/^v1\.\d+\./);
    expect(api.callTwoShot).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/《ルーム２》/)).toBeInTheDocument();
    expect(sessionStore.getSnapshot()).toMatchObject({ status: 'active', roomId: '02', seat: 0 });
    // 入力値は「保存」にチェックがあれば保存する
    expect(JSON.parse(localStorage.getItem('okiraku:two-shot:entry')!)).toMatchObject({
      name: 'はなこ',
      sex: 'F',
    });
  });

  it('入室の応答を受け取れなければ E12。同じ入力で入室し直すと同じトークンで再送する', async () => {
    api.callTwoShot.mockResolvedValueOnce('failed').mockResolvedValueOnce(roomResponse(ownerOnly));
    render(<TwoShotPage />);
    await act(async () => fillAndEnter());
    expect(screen.getByRole('heading', { name: 'システムエラー' })).toBeInTheDocument();
    expect(sessionStore.getSnapshot()).toMatchObject({ status: 'pending' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '直前の画面' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '入室' })));
    await waitFor(() => expect(screen.getByRole('region', { name: 'ログ' })).toBeInTheDocument());
    expect(api.callTwoShot.mock.calls[0][1]).toBe(api.callTwoShot.mock.calls[1][1]);
  });

  it('入力を変えて入室し直すと、新しいトークンにする', async () => {
    api.callTwoShot.mockResolvedValueOnce('failed').mockResolvedValueOnce(roomResponse(ownerOnly));
    render(<TwoShotPage />);
    await act(async () => fillAndEnter());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '直前の画面' })));
    fireEvent.change(screen.getByRole('textbox', { name: 'プロフィール' }), {
      target: { value: 'やあ' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '入室' })));
    expect(api.callTwoShot.mock.calls[0][1]).not.toBe(api.callTwoShot.mock.calls[1][1]);
  });

  it('満室なら何も出さずに入口のまま一覧を取り直し、入力を残す', async () => {
    api.callTwoShot.mockResolvedValueOnce({ ok: true, screen: 'lobby' });
    render(<TwoShotPage />);
    await waitFor(() => expect(api.fetchLobby).toHaveBeenCalledTimes(1));
    await act(async () => fillAndEnter());
    expect(screen.getByRole('region', { name: '空室状況' })).toBeInTheDocument();
    expect(api.fetchLobby).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('combobox', { name: 'ルーム' })).toHaveValue('02');
    expect(sessionStore.getSnapshot()).toBeNull();
  });

  it('重複入室はページ全体で E2 を出し、保留中の試行を消す', async () => {
    api.callTwoShot.mockResolvedValueOnce({ ok: false, notice: 'E2', placement: 'page' });
    render(<TwoShotPage />);
    await act(async () => fillAndEnter());
    expect(screen.getByText('重複入室を検知しましたので、入室できません.')).toBeInTheDocument();
    expect(sessionStore.getSnapshot()).toBeNull();
  });

  it('「保存」を外して入室すると保存値を消す', async () => {
    localStorage.setItem(
      'okiraku:two-shot:entry',
      JSON.stringify({ name: 'x', sex: 'M', profile: '' })
    );
    api.callTwoShot.mockResolvedValueOnce({ ok: true, screen: 'lobby' });
    render(<TwoShotPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: '保存' }));
    await act(async () => fillAndEnter());
    expect(localStorage.getItem('okiraku:two-shot:entry')).toBe('null');
  });
});

describe('入室後', () => {
  async function enterAsOwner() {
    const withGuest = run([
      ['a', enterCmd('はなこ')],
      ['b', enterCmd('たろう')],
    ]);
    api.callTwoShot.mockResolvedValueOnce(roomResponse(withGuest));
    render(<TwoShotPage />);
    await act(async () => fillAndEnter());
    await waitFor(() => expect(screen.getByRole('region', { name: 'ログ' })).toBeInTheDocument());
    return withGuest;
  }

  it('発言すると応答のログを出し、発言欄の文字は残る', async () => {
    const state = await enterAsOwner();
    const said = applyCommand(
      state,
      { op: 'say', text: 'こんにちは' },
      {
        roomId: '02',
        now: T0 + 5,
        tokenHash: 'h:a',
        admission: null,
        requestHash: null,
        entryCreatedAt: null,
        newMemberId: 'x',
        ip: null,
        ua: '',
      }
    ).state;
    api.callTwoShot.mockResolvedValueOnce(roomResponse(said));
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: 'こんにちは' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '発言' })));
    expect(api.callTwoShot.mock.calls[1][0]).toEqual({ room: '02', op: 'say', text: 'こんにちは' });
    await waitFor(() => expect(screen.getByText('はなこ > こんにちは')).toBeInTheDocument());
    expect(input).toHaveValue('こんにちは');
  });

  it('相手を退室させると自動更新を「なし」に戻す', async () => {
    const state = await enterAsOwner();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.callTwoShot.mockResolvedValue(roomResponse(state));
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: '自動(20秒)' })));
    await waitFor(() => expect(screen.getByRole('radio', { name: '自動(20秒)' })).toBeChecked());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '相手を退室' })));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'なし' })).toBeChecked());
    expect(api.callTwoShot.mock.calls.map(([request]) => request.op)).toEqual([
      'enter',
      'read',
      'kick',
    ]);
  });

  it('閉鎖すると下のペインだけ E8 になり、直前の画面でログに戻れる。空室状況へで入口に戻る', async () => {
    await enterAsOwner();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.callTwoShot.mockResolvedValueOnce({ ok: false, notice: 'E8', placement: 'pane' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '閉鎖' })));
    const bottom = screen.getByRole('region', { name: 'ログ' });
    expect(within(bottom).getByRole('heading', { name: '閉鎖' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '入力画面' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '直前の画面' })));
    expect(within(bottom).getByText(/このチャットルームをロックしました/)).toBeInTheDocument();
    api.callTwoShot.mockResolvedValueOnce({ ok: false, notice: 'E4', placement: 'pane' });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'いつでも手動更新' }))
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '空室状況へ' })));
    expect(screen.getByRole('region', { name: '空室状況' })).toBeInTheDocument();
    expect(sessionStore.getSnapshot()).toBeNull();
  });
});

describe('再読み込みからの復元', () => {
  const token = createEntryToken(T0);
  beforeEach(() => {
    sessionStore.set({
      status: 'active',
      token,
      roomId: '02',
      seat: 0,
      me: { name: 'はなこ', sex: 'F' },
    });
  });

  it('このタブの Session が有効なら、入室後の画面に戻る', async () => {
    api.callTwoShot.mockResolvedValueOnce(roomResponse(ownerOnly));
    render(<TwoShotPage />);
    await waitFor(() =>
      expect(screen.getByText(/管制者\(ルームを開設した方\)/)).toBeInTheDocument()
    );
    expect(api.callTwoShot).toHaveBeenCalledWith(
      { room: '02', op: 'read' },
      token,
      expect.anything()
    );
  });

  it('失効していたら入口に戻り、Session を消す', async () => {
    api.callTwoShot.mockResolvedValueOnce({ ok: false, notice: 'E4', placement: 'pane' });
    render(<TwoShotPage />);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: '空室状況' })).toBeInTheDocument()
    );
    expect(sessionStore.getSnapshot()).toBeNull();
  });

  it('通信に失敗したら、保存した名前で上のペインを出し、下のペインに E12 を出す', async () => {
    api.callTwoShot.mockResolvedValueOnce('failed');
    render(<TwoShotPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'システムエラー' })).toBeInTheDocument()
    );
    expect(screen.getByRole('region', { name: '入力画面' })).toHaveTextContent('はなこ(女)');
    expect(sessionStore.getSnapshot()).not.toBeNull();
  });
});

describe('入室後の reducer', () => {
  const session = {
    status: 'active',
    token: createEntryToken(T0),
    roomId: '02',
    seat: 0,
    me: { name: 'はなこ', sex: 'F' },
  } as const;
  const logState: RoomUiState = {
    seat: 0,
    me: session.me,
    bottom: { kind: 'log', view: view(ownerOnly) },
    previous: null,
    auto: 20,
    terminal: false,
  };

  beforeEach(() => sessionStore.set(session));

  it('失効のお知らせでは自動更新を止め、直前の画面に戻しても再開しない', async () => {
    const call = vi.fn().mockResolvedValue({ ok: false, notice: 'E7', placement: 'pane' });
    const left = await reduceRoom(session, logState, { type: 'leave' }, call);
    expect(left).toMatchObject({ auto: 0, terminal: true, bottom: { kind: 'notice', code: 'E7' } });
    const back = await reduceRoom(session, left, { type: 'back' }, call);
    expect(back).toMatchObject({ terminal: true, bottom: { kind: 'log' } });
  });

  it('お知らせが続いても、直前のログを上書きしない', async () => {
    const call = vi.fn().mockResolvedValue('failed');
    const first = await reduceRoom(session, logState, { type: 'read' }, call);
    const second = await reduceRoom(session, first, { type: 'read' }, call);
    expect(second.previous).toBe(logState.bottom);
  });

  it('直前のログがなければ、直前の画面は取り直しになる', async () => {
    const call = vi.fn().mockResolvedValue(roomResponse(ownerOnly));
    const next = await reduceRoom(
      session,
      { ...logState, bottom: { kind: 'notice', code: 'E12' } },
      { type: 'back' },
      call
    );
    expect(call).toHaveBeenCalledWith({ room: '02', op: 'read' }, session.token);
    expect(next.bottom.kind).toBe('log');
  });

  it('待っている間に Session を離れていたら何も変えない', async () => {
    const call = vi.fn(async () => {
      sessionStore.clearIfToken(session.token);
      return roomResponse(ownerOnly);
    });
    expect(await reduceRoom(session, logState, { type: 'read' }, call)).toBe(logState);
  });
});
