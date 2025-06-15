import { render, screen } from '@testing-library/react';
import ChatRanking from './ChatRanking';
import { vi } from 'vitest';

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
      { name: 'みどり', text: 'hi', createdAt: '2024-06-01T12:00:00Z' },
      { name: 'みどり', text: 'hello', createdAt: '2024-06-01T12:01:00Z' },
      { name: 'ゆい', text: 'やっほー', createdAt: '2024-06-01T12:02:00Z' },
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
    const chatLog = [{ name: 'A', text: 'a', createdAt: '2024-06-15T10:00:00Z' }];
    const { container } = render(<ChatRanking chatLog={chatLog} />);
    expect(container).toMatchSnapshot();
  });
});
