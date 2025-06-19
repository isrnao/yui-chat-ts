import { render, screen } from '@testing-library/react';
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
        ip: '192.168.1.1',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      {
        uuid: '2',
        name: 'みどり',
        color: '#00f',
        message: 'hello',
        time: 2,
        createdAt: '2024-06-01T12:01:00Z',
        ip: '192.168.1.1',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      {
        uuid: '3',
        name: 'ゆい',
        color: '#f0f',
        message: 'やっほー',
        time: 3,
        createdAt: '2024-06-01T12:02:00Z',
        ip: '192.168.1.2',
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

  it('スナップショットが一致する', () => {
    const chatLog = [
      {
        uuid: 'a',
        name: 'A',
        color: '#000',
        message: 'a',
        time: 10,
        createdAt: '2024-06-15T10:00:00Z',
        ip: '192.168.1.1',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    ];
    const { container } = render(<ChatRanking chatLog={chatLog} />);
    expect(container).toMatchSnapshot();
  });
});
