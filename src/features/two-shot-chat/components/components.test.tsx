import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  applyCommand,
  emptyRoomState,
  ROOM_IDS,
  toRoomView,
  type Command,
  type RoomState,
} from '../../../../supabase/functions/two-shot/rules.ts';
import { getTwoShotRoomName, TWO_SHOT_CONFIG } from '../config';
import { formatTime } from '../utils/formatTime';
import ChatForm from './ChatForm';
import ChatLog from './ChatLog';
import EntryForm, { type EntryValues } from './EntryForm';
import FrameLayout from './FrameLayout';
import NoticePage from './NoticePage';
import RoomList from './RoomList';

const T0 = Date.UTC(2026, 8, 23, 21, 12, 0); // 2026-09-24 06:12（日本時間）

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('設定', () => {
  it('部屋はサーバーと同じ 01〜10 で、名前は全角の数字', () => {
    expect(TWO_SHOT_CONFIG.rooms.map((room) => room.id)).toEqual([...ROOM_IDS]);
    expect(getTwoShotRoomName('01')).toBe('ルーム１');
    expect(getTwoShotRoomName('10')).toBe('ルーム１０');
  });

  it('ログの時刻は日本時間の HH:MM', () => {
    expect(formatTime(T0)).toBe('06:12');
    expect(formatTime(Date.UTC(2026, 8, 23, 15, 5, 0))).toBe('00:05');
  });
});

describe('FrameLayout', () => {
  function setup(height = 805) {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
    render(
      <FrameLayout
        initialTopPercent={30}
        topLabel="上"
        bottomLabel="下"
        top={<p>上のペイン</p>}
        bottom={<p>下のペイン</p>}
      />
    );
    return screen.getByRole('separator', { name: 'フレームの境界' });
  }

  it('上下のペインと境界線を出し、境界線の値は最初の割合', () => {
    const separator = setup();
    expect(screen.getByRole('region', { name: '上' })).toHaveTextContent('上のペイン');
    expect(screen.getByRole('region', { name: '下' })).toHaveTextContent('下のペイン');
    expect(separator).toHaveAttribute('aria-valuenow', '30');
    expect(separator).toHaveAttribute('tabindex', '0');
  });

  it('上下の矢印キーで 1% ずつ動かせる', () => {
    const separator = setup();
    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(separator).toHaveAttribute('aria-valuenow', '31');
    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(separator).toHaveAttribute('aria-valuenow', '29');
  });

  it('ペインは 40px より小さくならない', () => {
    const separator = setup();
    for (let i = 0; i < 60; i++) fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(separator).toHaveAttribute('aria-valuenow', '5'); // 40 / 800
  });

  // 動かした後も px で固定しない。固定すると、ウィンドウを縮めたときに下のペインが 0 になる
  it('ドラッグした位置を割合で持ち、ウィンドウの高さが変わっても両方のペインを残す', () => {
    // jsdom には PointerEvent と Pointer Capture がないので、テストの中でだけ用意する
    vi.stubGlobal(
      'PointerEvent',
      class extends MouseEvent {
        pointerId: number;
        constructor(
          type: string,
          init: ConstructorParameters<typeof MouseEvent>[1] & { pointerId?: number } = {}
        ) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      }
    );
    // （jsdom の環境はテストのファイルごとに作り直されるので、ほかのファイルには残らない）
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      hasPointerCapture: () => false,
    });
    const separator = setup();
    const frames = separator.parentElement!;
    fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientY: 240 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientY: 600 });
    fireEvent.pointerUp(separator, { pointerId: 1, clientY: 600 });

    expect(separator).toHaveAttribute('aria-valuenow', '75'); // (240 + 360) / 800
    expect(frames.style.getPropertyValue('--ts-top')).toBe('0.75');
    expect(frames.style.gridTemplateRows).toBe('');
  });
});

describe('EntryForm', () => {
  const values: EntryValues = { name: '', sex: '-', room: '', profile: '', save: true };

  function setup(overrides: Partial<EntryValues> = {}, focus: 'name' | 'profile' = 'name') {
    const onChange = vi.fn();
    const action = vi.fn();
    const { container } = render(
      <EntryForm
        values={{ ...values, ...overrides }}
        onChange={onChange}
        action={action}
        focus={focus}
      />
    );
    return { onChange, action, container };
  }

  it('原作と同じ入力欄の幅と上限、部屋の並びを出す', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'ツーショットチャット' })).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'チャット名' });
    expect(name).toHaveAttribute('size', '30');
    expect(name).toHaveAttribute('maxlength', '30');
    const profile = screen.getByRole('textbox', { name: 'プロフィール' });
    expect(profile).toHaveAttribute('size', '50');
    expect(profile).toHaveAttribute('maxlength', '60');
    const options = within(screen.getByRole('combobox', { name: 'ルーム' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      '▼ルームを選択してください',
      ...TWO_SHOT_CONFIG.rooms.map((room) => room.name),
    ]);
    expect(screen.getByRole('radio', { name: '？' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '保存' })).toBeChecked();
  });

  it('保存値がなければチャット名に、あればプロフィールにフォーカスする', () => {
    const { container } = setup();
    expect(document.activeElement).toBe(
      within(container).getByRole('textbox', { name: 'チャット名' })
    );
  });

  it('保存値があるとプロフィールにフォーカスする', () => {
    const { container } = setup({ name: 'はなこ' }, 'profile');
    expect(document.activeElement).toBe(
      within(container).getByRole('textbox', { name: 'プロフィール' })
    );
  });

  it('入力の変更を親に伝える', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'チャット名' }), {
      target: { value: 'あ' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '女' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'ルーム' }), { target: { value: '03' } });
    expect(onChange.mock.calls).toEqual([[{ name: 'あ' }], [{ sex: 'F' }], [{ room: '03' }]]);
  });

  it('入室と開設は押したボタンで区別して Action に渡す', async () => {
    const { action } = setup({ name: 'はなこ', room: '02' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '開設' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '入室' }));
    });
    const [[make], [enter]] = action.mock.calls as [FormData][];
    expect(make.get('make')).toBe('開設');
    expect(make.get('room')).toBe('02');
    expect(enter.has('make')).toBe(false);
    expect(enter.get('chat_name')).toBe('はなこ');
  });
});

describe('RoomList', () => {
  function setup(props: Partial<Parameters<typeof RoomList>[0]> = {}) {
    const handlers = { onReload: vi.fn(), onSetAuto: vi.fn() };
    render(
      <RoomList
        lobby={{ kind: 'idle' }}
        auto={false}
        homeHref="/"
        reportHref="/chat/com_sb/"
        {...handlers}
        {...props}
      />
    );
    return handlers;
  }

  // レイアウト用の外側の表を除き、一覧の表の見出し行より下だけを見る
  const rows = () =>
    within(document.querySelector<HTMLElement>('.ts-grid')!).getAllByRole('row').slice(1);

  it('取得前は部屋名だけで、状態などの欄は空', () => {
    setup();
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toHaveTextContent(/^ルーム１\s*$/);
    expect(screen.queryByText('異常(2)')).not.toBeInTheDocument();
  });

  it('取得に失敗すると、各行を 異常(2) にする', () => {
    setup({ lobby: { kind: 'error' } });
    expect(screen.getAllByText('異常(2)')).toHaveLength(10);
  });

  it('待機中だけ管制者の性別・名前・プロフィールを出し、満室では出さない', () => {
    setup({
      lobby: {
        kind: 'loaded',
        rows: {
          '01': { status: 'waiting', sex: 'F', name: 'はなこ', profile: 'よろしく' },
          '02': { status: 'full' },
          '03': { status: 'empty' },
        },
      },
    });
    expect(rows()[0]).toHaveTextContent('待機中');
    expect(rows()[0]).toHaveTextContent('女');
    expect(rows()[0]).toHaveTextContent('はなこ');
    expect(rows()[0]).toHaveTextContent('よろしく');
    expect(rows()[1]).toHaveTextContent(/^ルーム２\s*満室\s*$/);
    expect(rows()[2]).toHaveTextContent('空室');
  });

  it('プロフィールの文字参照は記号にし、タグは文字のまま出す', () => {
    setup({
      lobby: {
        kind: 'loaded',
        rows: {
          '01': {
            status: 'waiting',
            sex: 'F',
            name: 'はなこ',
            profile: '&hearts;&lt;b&gt;よろしく',
          },
        },
      },
    });
    const profileCell = rows()[0].querySelectorAll('td')[3];
    expect(profileCell).toHaveTextContent('♥<b>よろしく');
    expect(profileCell.children).toHaveLength(0);
  });

  it('手動更新と自動更新の切り替え', () => {
    const handlers = setup();
    fireEvent.click(screen.getByRole('button', { name: '手動更新' }));
    fireEvent.click(screen.getByRole('button', { name: '自動更新(60秒)にする' }));
    expect(handlers.onReload).toHaveBeenCalledTimes(1);
    expect(handlers.onSetAuto).toHaveBeenCalledWith(true);
  });

  it('自動更新中の表示', () => {
    const handlers = setup({ auto: true });
    expect(screen.getByText(/60秒自動更新中/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '手動更新にする' }));
    expect(handlers.onSetAuto).toHaveBeenCalledWith(false);
  });

  it('注意書き・ホームページへのリンク・原作のクレジットを出す', () => {
    setup();
    expect(screen.getByText('▼重要なお知らせ')).toBeInTheDocument();
    expect(screen.getByText(/会話の控えを 30 日間保存/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '管理者チャット' })).toHaveAttribute(
      'href',
      '/chat/com_sb/'
    );
    expect(screen.getByRole('link', { name: 'ホームページへ戻る' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '2SHOT-CHAT' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
  });
});

describe('ChatForm', () => {
  function setup(seat: 0 | 1, value = '') {
    const handlers = {
      onValueChange: vi.fn(),
      onSay: vi.fn(),
      onReload: vi.fn(),
      onSetAuto: vi.fn(),
      onClose: vi.fn(),
      onKick: vi.fn(),
      onLeave: vi.fn(),
    };
    render(
      <ChatForm
        roomName="ルーム１"
        me={{ name: 'はなこ', sex: 'F' }}
        seat={seat}
        value={value}
        auto={0}
        {...handlers}
      />
    );
    return handlers;
  }

  it('管制者には 閉鎖 と 相手を退室、入室者には 退室 を出す', () => {
    setup(0);
    expect(screen.getByRole('button', { name: '閉鎖' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '相手を退室' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退室' })).not.toBeInTheDocument();
  });

  it('入室者の表示', () => {
    setup(1);
    expect(screen.getByText(/《ルーム１》/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退室' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '閉鎖' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '発言' })).toHaveAttribute('size', '60');
  });

  it('確認ダイアログでキャンセルすると何もしない', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const handlers = setup(0);
    fireEvent.click(screen.getByRole('button', { name: '閉鎖' }));
    fireEvent.click(screen.getByRole('button', { name: '相手を退室' }));
    expect(confirm.mock.calls).toEqual([
      ['閉鎖します. よろしいですか？'],
      ['相手を退室させます. よろしいですか？'],
    ]);
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onKick).not.toHaveBeenCalled();
  });

  it('確認すると操作する', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const handlers = setup(1);
    fireEvent.click(screen.getByRole('button', { name: '退室' }));
    expect(confirm).toHaveBeenCalledWith('あなただけ退室します. よろしいですか？');
    expect(handlers.onLeave).toHaveBeenCalledTimes(1);
  });

  it('発言すると、文字を残したまま全選択してフォーカスを戻す', () => {
    const handlers = setup(1, 'こんにちは');
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: '発言' });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));
    expect(handlers.onSay).toHaveBeenCalledWith('こんにちは');
    expect(handlers.onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'こんにちは'.length]);
  });

  it('いつでも手動更新とラジオは、発言欄を空にして取り直す', () => {
    const handlers = setup(1, 'x');
    fireEvent.click(screen.getByRole('button', { name: 'いつでも手動更新' }));
    fireEvent.click(screen.getByRole('radio', { name: '自動(20秒)' }));
    // 選択済みの「なし」を押しても取り直す（原作の onClick="Reload()"）
    fireEvent.click(screen.getByRole('radio', { name: 'なし' }));
    expect(handlers.onValueChange.mock.calls).toEqual([[''], [''], ['']]);
    expect(handlers.onReload).toHaveBeenCalledTimes(1);
    expect(handlers.onSetAuto.mock.calls).toEqual([[20], [0]]);
  });

  it('表示されたら発言欄にフォーカスする', () => {
    setup(0);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '発言' }));
  });
});

describe('ChatLog', () => {
  const A = { token: 'a', ip: '203.0.113.1', ua: 'UA-A' };
  const B = { token: 'b', ip: '198.51.100.2', ua: 'UA-B' };
  function run(steps: [typeof A, Command][]): RoomState {
    let state = emptyRoomState();
    steps.forEach(([actor, cmd], i) => {
      state = applyCommand(state, cmd, {
        roomId: '01',
        now: T0 + i,
        tokenHash: `h:${actor.token}`,
        admission: null,
        requestHash: 'r',
        entryCreatedAt: T0,
        newMemberId: `m:${actor.token}`,
        ip: actor.ip,
        ua: actor.ua,
      }).state;
    });
    return state;
  }
  const state = run([
    [A, { op: 'enter', name: 'alice', sex: 'M', profile: '', make: false }],
    [B, { op: 'enter', name: 'はなこ', sex: 'F', profile: '', make: false }],
    [A, { op: 'say', text: '<b>こんにちは</b>' }],
    [B, { op: 'say', text: 'はじめまして' }],
  ]);

  it('新しい順に並べ、自分の発言を薄い色で、相手とお知らせを太字の名前で出す', () => {
    const { container } = render(
      <ChatLog view={toRoomView('01', state, 1, T0 + 12_000)} auto={0} onClear={vi.fn()} />
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('はじめまして')).toBeLessThan(text.indexOf('こんにちは'));
    expect(screen.getByText('はなこ > はじめまして')).toHaveStyle({ color: '#888888' });
    expect(screen.getByText('alice').tagName).toBe('B');
    // タグは解釈せず文字のまま出す
    expect(container.textContent).toContain('<b>こんにちは</b>');
    expect(container.textContent).toContain(
      'おしらせ > はなこ(女)さん が入室しましたので、このチャットルームをロックしました. (06:12)'
    );
    expect(container.querySelectorAll('hr')).toHaveLength(3);
  });

  it('発言とプロフィールのお知らせは、文字参照を記号にして出す', () => {
    const refs = run([
      [A, { op: 'enter', name: 'alice', sex: 'M', profile: '', make: false }],
      [B, { op: 'enter', name: 'はなこ', sex: 'F', profile: '&hearts;です', make: false }],
      [A, { op: 'say', text: 'すき&#9829;&lt;i&gt;' }],
      [B, { op: 'say', text: '&amp;hearts; &#x2665;' }],
    ]);
    const { container } = render(
      <ChatLog view={toRoomView('01', refs, 0, T0 + 12_000)} auto={0} onClear={vi.fn()} />
    );
    expect(screen.getByText('alice > すき♥<i>')).toBeInTheDocument();
    expect(container.textContent).toContain('はなこ > &hearts; ♥');
    expect(container.textContent).toContain('はなこさんのプロフィール『 ♥です 』');
    expect(container.querySelector('i')).toBeNull();
  });

  it('更新の方式・無発言監視タイマ・表示行数を出す。画面クリアは管制者だけ', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <ChatLog view={toRoomView('01', state, 1, T0 + 12_000)} auto={20} onClear={onClear} />
    );
    expect(screen.getByText(/〔20秒自動更新〕/)).toBeInTheDocument();
    expect(screen.getByText(/〔無発言監視タイマ11秒経過→300秒後閉鎖〕/)).toBeInTheDocument();
    expect(screen.getByText(/〔表示10行〕/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '画面クリア' })).not.toBeInTheDocument();
    rerender(<ChatLog view={toRoomView('01', state, 0, T0 + 12_000)} auto={0} onClear={onClear} />);
    expect(screen.getByText(/〔手動更新〕/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '画面クリア' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('NoticePage', () => {
  it('見出しと本文、空室状況へ・ホームページへ戻る・直前の画面を出す', () => {
    const onLobby = vi.fn();
    const onBack = vi.fn();
    render(<NoticePage code="E3" onLobby={onLobby} onBack={onBack} homeHref="/" />);
    expect(screen.getByRole('heading', { name: '終了1' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'あなたは現在の利用者であるという認証ができません.',
      'または、データが制限サイズを越えましたので閉鎖しました.',
      '〔空室状況へ〕',
      '〔ホームページへ戻る〕',
      '〔直前の画面〕',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '空室状況へ' }));
    fireEvent.click(screen.getByRole('button', { name: '直前の画面' }));
    expect(onLobby).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
