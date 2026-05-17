import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TopPage from './TopPage';

// Supabase 未設定のときは useRoomCounts が即座に空オブジェクトで解決するが、
// 念のため fetch 呼び出しをモックして確実に空を返すようにする。
vi.mock('./api/roomCountsApi', () => ({
  fetchRoomParticipantCounts: vi.fn().mockResolvedValue({}),
}));

describe('<TopPage />', () => {
  it('renders the legacy top page with internal chat room links', async () => {
    render(<TopPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    expect(screen.getByText('注目のチャット ピックアップ')).toBeInTheDocument();

    const superbeginner = screen.getAllByRole('link', { name: '超初心者チャット' })[0];
    expect(superbeginner).toHaveAttribute('href', '/yui-chat-ts/chat/superbeginner');
    expect(superbeginner).not.toHaveAttribute('target');
    expect(superbeginner).not.toHaveAttribute('rel');

    // 非同期の state 更新 (useRoomCounts) を flush する
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    });
  });

  it('maps every left-column room to its internal route', async () => {
    render(<TopPage />);

    const cases: Array<[string, string]> = [
      ['初めましてチャット', '/yui-chat-ts/chat/hajime'],
      ['みんなのチャット', '/yui-chat-ts/chat/ofall'],
      ['夢と希望のチャット', '/yui-chat-ts/chat/yume'],
      ['小学生チャット', '/yui-chat-ts/chat/elementary'],
      ['関東チャット', '/yui-chat-ts/chat/area_kantoh'],
      ['バトルチャット', '/yui-chat-ts/chat/battle'],
      ['初めてチャット', '/yui-chat-ts/chat/hajime-old'],
    ];

    for (const [name, expectedHref] of cases) {
      // 同名リンクがタブナビ (#pickup-*) に存在する場合があるため、
      // /yui-chat-ts/chat/ で始まる href を持つものに絞り込む。
      const link = screen
        .getAllByRole('link', { name })
        .find((el) => el.getAttribute('href')?.startsWith('/yui-chat-ts/chat/'));
      expect(link, `internal link not found for "${name}"`).toBeDefined();
      expect(link).toHaveAttribute('href', expectedHref);
      expect(link).not.toHaveAttribute('target');
      expect(link).not.toHaveAttribute('rel');
    }

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    });
  });

  it('keeps web.archive.org out of the rendered output', async () => {
    const { container } = render(<TopPage />);
    expect(container.innerHTML).not.toContain('web.archive.org');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    });
  });
});
