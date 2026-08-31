import { fireEvent, render, screen } from '@testing-library/react';
import ChatRanking from './index';
import { vi, describe, it, expect } from 'vitest';

// formatCountTimeをモック（呼び出し確認もしやすい）
vi.mock('@shared/utils/format', () => ({
  formatCountTime: (time: string) => `formatted:${time}`,
}));

describe('<ChatRanking />', () => {
  it('チャット履歴が空の時、「データなし」を表示する', () => {
    render(<ChatRanking chatLog={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
  });

  it('ランキングが正しく表示される', () => {
    // 仮のチャットログデータ
    const chatLog = [
      {
        uuid: '1',
        name: 'みどり',
        color: '#00f',
        message: 'hi',
        time: 1,
        createdAt: '2024-06-01T12:00:00Z',
        ip_masked: '192.168.1.1',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      {
        uuid: '2',
        name: 'みどり',
        color: '#00f',
        message: 'hello',
        time: 2,
        createdAt: '2024-06-01T12:01:00Z',
        ip_masked: '192.168.1.1',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      {
        uuid: '3',
        name: 'ゆい',
        color: '#f0f',
        message: 'やっほー',
        time: 3,
        createdAt: '2024-06-01T12:02:00Z',
        ip_masked: '192.168.1.2',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    ];

    render(<ChatRanking chatLog={chatLog} />);
    // 名前が表示される
    expect(screen.getByText('みどり')).toBeInTheDocument();
    expect(screen.getByText('ゆい')).toBeInTheDocument();
    // 発言回数
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // formatCountTimeの返り値（最終発言時刻カラム）
    expect(screen.getAllByText(/^formatted:/).length).toBeGreaterThan(0);
  });

  it('レガシー同様の見出し・区切り線・列構成を持つ', () => {
    const { container } = render(<ChatRanking chatLog={[]} roomTitle="サッカーチャット" />);

    // <h3>{部屋名}の発言ランキング</h3>
    const h3 = container.querySelector('h3');
    expect(h3?.textContent).toBe('サッカーチャットの発言ランキング');
    // テーブルの上下に <hr>
    expect(container.querySelectorAll('hr')).toHaveLength(2);
    // 列は おなまえ / 発言回数 / 最終発言時刻 / ホスト情報 の4つ
    expect(Array.from(container.querySelectorAll('th')).map((th) => th.textContent)).toEqual([
      'おなまえ',
      '発言回数',
      '最終発言時刻',
      'ホスト情報',
    ]);
  });

  it('部屋名リンクからチャットへ戻れる', () => {
    const onBackToChat = vi.fn();
    render(<ChatRanking chatLog={[]} roomTitle="サッカーチャット" onBackToChat={onBackToChat} />);

    fireEvent.click(screen.getByRole('button', { name: 'サッカーチャット' }));
    expect(onBackToChat).toHaveBeenCalled();
  });

  it('名前を発言者の色で表示し、ホスト情報にマスク済み IP を出す', () => {
    const chatLog = [
      {
        uuid: 'a',
        name: 'A',
        color: '#ff6699',
        message: 'a',
        time: 10,
        ip_masked: '58.*.*.60',
        ua: '',
      },
    ];
    const { container } = render(<ChatRanking chatLog={chatLog} />);

    expect(screen.getByText('A')).toHaveStyle({ color: '#ff6699' });
    expect(screen.getByText('58.*.*.60')).toBeInTheDocument();
    expect(container.querySelector('table')).toHaveClass('border-separate');
  });

  it('フォントユーティリティが適用される', () => {
    const chatLog = [
      {
        uuid: 'a',
        name: 'A',
        color: '#000',
        message: 'a',
        time: 10,
        createdAt: '2024-06-15T10:00:00Z',
        ip_masked: '192.168.1.1',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    ];
    const { container } = render(<ChatRanking chatLog={chatLog} />);
    expect(container.firstElementChild).toHaveClass('font-yui');
  });
});
