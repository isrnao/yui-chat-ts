import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import ChatLogList from './index';
import type { Chat } from '@features/chat/types';
import { useIpFilter } from '@features/chat/hooks/useIpFilter';
import { getSnapshot as getFilteredIps } from '@features/chat/utils/ipFilterStore';

vi.mock('@shared/utils/format', () => ({
  formatTime: (t: number) => `TIME(${t})`,
  formatLegacyDateTime: (t: number) => `DATE(${t})`,
}));

describe('ChatLogList', () => {
  // 注意: ChatLogList は内部で useParticipants(chatLog) を呼ぶ。
  // getRecentParticipants は「直近 5 分以内」のメッセージから参加者を抽出するため、
  // テストでは Date.now() を fakeTimers で固定し、固定時刻基準の chatLog を組み立てる。
  const FIXED_NOW = 1_700_000_000_000;
  const chatLog: Chat[] = [
    {
      uuid: '1',
      name: 'Taro',
      color: '#f00',
      message: 'Hello',
      time: FIXED_NOW - 2000,
      email: '',
      ip_masked: 'test-ip',
      ua: 'test-ua',
    },
    {
      uuid: '2',
      name: 'Jiro',
      color: '#0f0',
      message: 'World',
      time: FIXED_NOW - 1000,
      email: 'jiro@mail.com',
      ip_masked: 'test-ip',
      ua: 'test-ua',
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders no message when chatLog is empty', () => {
    render(<ChatLogList chatLog={[]} windowRows={10} />);
    expect(screen.getByText('まだ発言はありません。')).toBeInTheDocument();
    expect(screen.getByText('参加者(0):')).toBeInTheDocument();
    expect(screen.getByText('（なし）')).toBeInTheDocument();
  });

  it('derives participants from chatLog (Taro/Jiro)', () => {
    render(<ChatLogList chatLog={chatLog} windowRows={10} />);
    // ChatMessage 内にも Taro/Jiro が出るので getAllByText を使う
    expect(screen.getAllByText('Taro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Jiro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('参加者(2):')).toBeInTheDocument();
  });

  it('renders chat messages sliced by windowRows (descending input preserved)', () => {
    // ChatLogList は sort せず slice のみ。配列順 = 表示順。
    const desc = [...chatLog].reverse(); // 新しい順 [Jiro, Taro]
    const { unmount } = render(<ChatLogList chatLog={desc} windowRows={2} />);
    expect(screen.getAllByText('Jiro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Taro').length).toBeGreaterThanOrEqual(1);
    unmount();

    // windowRows=1 で先頭の Jiro だけ表示（ただし参加者リストは chatLog 全体から抽出）
    render(<ChatLogList chatLog={desc} windowRows={1} />);
    expect(screen.getAllByText('Jiro').length).toBeGreaterThanOrEqual(1);
    // ChatMessage としての Taro は表示されないが、参加者リストには残る可能性があるため
    // 「メッセージ本文に含まれる Hello」で判定する
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('shows mailto link if email is present', () => {
    render(<ChatLogList chatLog={chatLog} windowRows={2} />);
    const mailLink = screen.getByRole('link', { name: '>' });
    expect(mailLink).toHaveAttribute('href', 'mailto:jiro@mail.com');
    expect(mailLink).toHaveAttribute('target', '_blank');
  });

  it('shows > with no mailto if no email', () => {
    render(<ChatLogList chatLog={chatLog} windowRows={2} />);
    const allGt = screen.getAllByText('>');
    expect(allGt.length).toBe(2); // mailtoあり・なし両方
  });

  it('shows formatted time in header and messages', () => {
    const { container } = render(<ChatLogList chatLog={chatLog} windowRows={2} />);
    // header の時刻（slice(0,5)）。useNowMinute は初期値として Date.now() = FIXED_NOW を返す
    const header = container.querySelector('span.text-xs.text-gray-500');
    expect(header?.textContent).toMatch(/^\[TIME\(/);
    // 各チャットの時刻
    // 各チャットの時刻（レガシー互換: "日時 IP" 形式）
    expect(screen.getByText(`(DATE(${FIXED_NOW - 1000}) test-ip)`)).toBeInTheDocument();
    expect(screen.getByText(`(DATE(${FIXED_NOW - 2000}) test-ip)`)).toBeInTheDocument();
  });

  it('渡された順のまま表示し、並べ直さない（並び順は Room_Log_Store が保つ）', () => {
    // 発言が届くたびに全体を並べ直さないよう、ChatLogList は切り出すだけにした（Requirement 17）
    const log: Chat[] = [
      { ...chatLog[0]!, uuid: 'first', message: 'FIRST_MESSAGE', time: FIXED_NOW - 5000 },
      { ...chatLog[1]!, uuid: 'second', message: 'SECOND_MESSAGE', time: FIXED_NOW - 1000 },
    ];

    render(<ChatLogList chatLog={log} windowRows={1} />);
    expect(screen.getByText('FIRST_MESSAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECOND_MESSAGE')).not.toBeInTheDocument();
  });

  it('200 行を超えて表示するときだけ、画面外の行の描画を省く', () => {
    const rows = (count: number): Chat[] =>
      Array.from({ length: count }, (_, i) => ({
        ...chatLog[0]!,
        uuid: `row-${i}`,
        message: `ROW_${i}`,
      }));
    const rowOf = (text: string) => screen.getByText(text).closest('div.mb-1');

    const { unmount } = render(<ChatLogList chatLog={rows(300)} windowRows={200} />);
    expect(rowOf('ROW_0')?.className).not.toContain('content-visibility');
    unmount();

    render(<ChatLogList chatLog={rows(300)} windowRows={201} />);
    expect(rowOf('ROW_0')?.className).toContain('[content-visibility:auto]');
    expect(rowOf('ROW_200')?.className).toContain('[content-visibility:auto]');
  });
  describe('IP のフィルタ（chat-ip-mute）', () => {
    const log = (): Chat[] => [
      { ...chatLog[0]!, uuid: 'a1', message: 'A_FIRST', ip_masked: '219.*.*.253' },
      { ...chatLog[0]!, uuid: 'b1', message: 'B_FIRST', ip_masked: '2001:*' },
      { ...chatLog[0]!, uuid: 'a2', message: 'A_SECOND', ip_masked: '219.*.*.253' },
      { ...chatLog[0]!, uuid: 'b2', message: 'B_SECOND', ip_masked: '2001:*' },
    ];
    const filterOf = (...ips: string[]) => ({ ips, set: new Set(ips) });

    it('一致する発言を隠し、表示行数はフィルタの後で数える', () => {
      render(<ChatLogList chatLog={log()} windowRows={2} ipFilter={filterOf('219.*.*.253')} />);
      expect(screen.queryByText('A_FIRST')).not.toBeInTheDocument();
      expect(screen.queryByText('A_SECOND')).not.toBeInTheDocument();
      expect(screen.getByText('B_FIRST')).toBeInTheDocument();
      expect(screen.getByText('B_SECOND')).toBeInTheDocument();
    });

    it('ipFilter を渡さないページ（ちゃなり）では隠さない', () => {
      render(<ChatLogList chatLog={log()} windowRows={10} />);
      expect(screen.getByText('A_FIRST')).toBeInTheDocument();
    });

    it('参加者一覧にはフィルタを反映しない', () => {
      render(<ChatLogList chatLog={chatLog} windowRows={10} ipFilter={filterOf('test-ip')} />);
      expect(screen.queryByText('Hello')).not.toBeInTheDocument();
      expect(screen.getAllByText(/Taro/).length).toBeGreaterThanOrEqual(1);
    });

    it('すべて隠れたときは、フィルタ中の件数を出す', () => {
      render(
        <ChatLogList chatLog={log()} windowRows={10} ipFilter={filterOf('219.*.*.253', '2001:*')} />
      );
      expect(
        screen.getByText('表示できる発言はありません（4 件をフィルタ中）。')
      ).toBeInTheDocument();
    });
  });
  describe('ダブルタップでフィルタする（chat-ip-mute）', () => {
    /** jsdom には PointerEvent がないので、テストの中でだけ用意する */
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(
        type: string,
        init: ConstructorParameters<typeof MouseEvent>[1] & { pointerId?: number } = {}
      ) {
        super(type, { bubbles: true, cancelable: true, ...init });
        this.pointerId = init.pointerId ?? 1;
      }
    }

    /** ルートと同じく、ストアからフィルタを読んで渡す */
    function WithStore({ log }: { log: Chat[] }) {
      const ipFilter = useIpFilter();
      return <ChatLogList chatLog={log} windowRows={10} ipFilter={ipFilter} />;
    }

    const rowOf = (text: string) => screen.getByText(text).closest('div.mb-1')!;
    /** 2 回タップする。行の中の要素（文字）を押しても、行の handlers にバブリングする */
    const doubleTap = (target: Element) => {
      for (let i = 0; i < 2; i += 1) {
        fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: 50, clientY: 5 });
        fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: 50, clientY: 5 });
      }
    };

    beforeEach(() => {
      localStorage.clear();
      vi.stubGlobal('PointerEvent', TestPointerEvent);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('ダブルタップすると確認の窓を出し、「やめる」ならフィルタしない', () => {
      const log: Chat[] = [
        { ...chatLog[0]!, uuid: 'a1', message: 'A_FIRST', ip_masked: '219.*.*.253' },
      ];
      render(<WithStore log={log} />);

      doubleTap(rowOf('A_FIRST'));

      const dialog = screen.getByRole('alertdialog', {
        name: '219.*.*.253 の発言をフィルタ（非表示に）しますか？',
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'やめる' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(getFilteredIps()).toEqual([]);
      expect(screen.getByText('A_FIRST')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('文字の上をダブルタップして「フィルタする」を押すと、同じ伏せ字の IP の発言がすべて隠れ、支援技術に知らせる', () => {
      const log: Chat[] = [
        { ...chatLog[0]!, uuid: 'a1', message: 'A_FIRST', ip_masked: '219.*.*.253' },
        { ...chatLog[0]!, uuid: 'b1', message: 'B_FIRST', ip_masked: '2001:*' },
        {
          ...chatLog[0]!,
          uuid: 'a2',
          message: 'たろう さん、Welcome to お気楽チャット☆',
          name: '管理人',
          ip_masked: '219.*.*.253',
          metadata: { version: 1, kind: 'admin' },
        },
      ];
      render(<WithStore log={log} />);

      const vibrate = vi.fn(() => true);
      vi.stubGlobal('navigator', { ...navigator, vibrate });

      doubleTap(screen.getByText('A_FIRST'));
      expect(vibrate).not.toHaveBeenCalled();
      // 指では「フィルタする」に重ねた透明な switch を押す（iOS のハプティック）。ほかの端末は vibrate
      fireEvent.click(screen.getByTestId('filter-confirm-haptic-switch'));
      expect(vibrate).toHaveBeenCalledTimes(1);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(getFilteredIps()).toEqual(['219.*.*.253']);
      expect(screen.queryByText('A_FIRST')).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome to/)).not.toBeInTheDocument();
      expect(screen.getByText('B_FIRST')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        '219.*.*.253 の発言を非表示にしました。「フィルタ」から解除できます。'
      );
    });

    it('管理人の入退室と巫女の発言も、呼び出した人の IP でフィルタできる', () => {
      const log: Chat[] = [
        {
          ...chatLog[0]!,
          uuid: 'admin',
          message: 'たろう さん、Welcome to お気楽チャット☆',
          name: '管理人',
          system: true,
          ip_masked: '219.*.*.253',
          metadata: { version: 1, kind: 'admin' },
        },
        {
          ...chatLog[0]!,
          uuid: 'fortune',
          message: 'FORTUNE_RESULT',
          name: '巫女',
          system: true,
          ip_masked: '2001:*',
          metadata: { version: 1, kind: 'fortune' },
        },
        { ...chatLog[0]!, uuid: 'b1', message: 'B_FIRST', ip_masked: '2001:*' },
        { ...chatLog[0]!, uuid: 'a1', message: 'A_FIRST', ip_masked: '219.*.*.253' },
      ];
      render(<WithStore log={log} />);

      const adminRow = screen.getByText(/Welcome to/).closest('div.mb-1')!;
      expect(adminRow).toHaveClass('chat-row-filterable');
      doubleTap(adminRow);
      fireEvent.click(screen.getByTestId('filter-confirm-haptic-switch'));
      expect(getFilteredIps()).toEqual(['219.*.*.253']);
      expect(screen.queryByText('A_FIRST')).not.toBeInTheDocument();

      doubleTap(screen.getByText('FORTUNE_RESULT'));
      fireEvent.click(screen.getByTestId('filter-confirm-haptic-switch'));
      expect(getFilteredIps()).toEqual(['219.*.*.253', '2001:*']);
      expect(screen.queryByText('B_FIRST')).not.toBeInTheDocument();
    });

    it('IP が分からない行（機能要求の受付返信など）と送信中の行はダブルタップに反応しない', () => {
      const log: Chat[] = [
        {
          ...chatLog[0]!,
          uuid: 'reply',
          message: '機能要求を受け付けました（Issue #1）',
          name: '管理人',
          system: true,
          ip_masked: '',
          metadata: { version: 1, kind: 'admin' },
        },
        { ...chatLog[0]!, uuid: 'star', message: 'STAR', ip_masked: '*' },
        { ...chatLog[0]!, uuid: 'empty', message: 'EMPTY', ip_masked: '' },
        { ...chatLog[0]!, uuid: 'opt', message: 'SENDING', optimistic: true },
      ];
      render(<WithStore log={log} />);

      for (const text of ['STAR', 'EMPTY', 'SENDING']) {
        expect(rowOf(text)).not.toHaveClass('chat-row-filterable');
        doubleTap(rowOf(text));
      }
      const replyRow = screen.getByText(/機能要求を受け付けました/).closest('div.mb-1')!;
      expect(replyRow).not.toHaveClass('chat-row-filterable');
      doubleTap(replyRow);
      expect(getFilteredIps()).toEqual([]);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('ipFilter を渡さないページではダブルタップに反応しない', () => {
      render(<ChatLogList chatLog={chatLog} windowRows={10} />);
      expect(rowOf('Hello')).not.toHaveClass('chat-row-filterable');
      doubleTap(rowOf('Hello'));
      expect(getFilteredIps()).toEqual([]);
    });
  });
});
