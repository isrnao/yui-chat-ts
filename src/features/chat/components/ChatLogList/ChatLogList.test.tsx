import { useState } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ChatLogList from './index';
import type { Chat } from '@features/chat/types';
import * as uuidUtils from '@shared/utils/uuid';

vi.mock('@shared/utils/format', () => ({
  formatTime: (t: number) => `TIME(${t})`,
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
      ip: 'test-ip',
      ua: 'test-ua',
    },
    {
      uuid: '2',
      name: 'Jiro',
      color: '#0f0',
      message: 'World',
      time: FIXED_NOW - 1000,
      email: 'jiro@mail.com',
      ip: 'test-ip',
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
    expect(screen.getByText(`(TIME(${FIXED_NOW - 1000}))`)).toBeInTheDocument();
    expect(screen.getByText(`(TIME(${FIXED_NOW - 2000}))`)).toBeInTheDocument();
  });

  it('sorts out-of-order chatLog by uuid v7 desc (newer first) before slicing by windowRows', () => {
    // out-of-order: 古いメッセージが配列先頭、新しいメッセージが配列末尾
    // (本実装が prepend を前提に sort をスキップする回帰を防ぐためのテスト)
    const outOfOrder: Chat[] = [
      {
        uuid: '0191b8a0-0001-7000-8000-000000000001', // uuid v7: 古め
        name: 'Older',
        color: '#000',
        message: 'OLDER_MESSAGE',
        time: FIXED_NOW - 5000,
        email: '',
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '0191b8a0-9999-7000-8000-000000000002', // uuid v7: 新しめ
        name: 'Newer',
        color: '#000',
        message: 'NEWER_MESSAGE',
        time: FIXED_NOW - 1000,
        email: '',
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    // windowRows=1: sort 後の先頭 (= Newer) だけが描画される
    render(<ChatLogList chatLog={outOfOrder} windowRows={1} />);
    expect(screen.getByText('NEWER_MESSAGE')).toBeInTheDocument();
    expect(screen.queryByText('OLDER_MESSAGE')).not.toBeInTheDocument();
  });

  it('falls back to time-desc sort when uuids are not v7 (e.g. temp- or test ids)', () => {
    // uuid が temp-* / 単純 id のときは isUUIDv7 が false を返し、time-desc に fallback する
    const outOfOrder: Chat[] = [
      {
        uuid: 'A',
        name: 'Older',
        color: '#000',
        message: 'OLDER_MESSAGE',
        time: FIXED_NOW - 5000,
        email: '',
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: 'B',
        name: 'Newer',
        color: '#000',
        message: 'NEWER_MESSAGE',
        time: FIXED_NOW - 1000,
        email: '',
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    render(<ChatLogList chatLog={outOfOrder} windowRows={1} />);
    expect(screen.getByText('NEWER_MESSAGE')).toBeInTheDocument();
    expect(screen.queryByText('OLDER_MESSAGE')).not.toBeInTheDocument();
  });

  it('does not recompute sorted/sliced chats when parent rerenders with the same chatLog reference', () => {
    // sortChatsByTime は ChatLogList の useMemo 内で呼ばれる。useMemo deps が
    // [chatLog, windowRows] のため、参照不変な再 render では再実行されない。
    const sortSpy = vi.spyOn(uuidUtils, 'sortChatsByTime');
    const stableChatLog = [...chatLog].reverse();

    function Host() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((value) => value + 1)}>
            rerender {tick}
          </button>
          <ChatLogList chatLog={stableChatLog} windowRows={2} />
        </>
      );
    }

    render(<Host />);
    const initialCallCount = sortSpy.mock.calls.length;
    expect(initialCallCount).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));

    // 親の tick だけが変わって chatLog 参照は不変なので sort 呼び出しは増えない
    expect(sortSpy.mock.calls.length).toBe(initialCallCount);

    sortSpy.mockRestore();
  });
});
