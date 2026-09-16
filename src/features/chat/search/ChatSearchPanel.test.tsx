import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatSearchPanel from './ChatSearchPanel';
import { searchChats } from './api';
import { trackEvent } from '@shared/utils/analytics';

vi.mock('./api', () => ({ searchChats: vi.fn() }));
vi.mock('@shared/utils/analytics', () => ({ trackEvent: vi.fn() }));
const item = {
  uuid: 'one',
  roomId: 'superbeginner' as const,
  name: '匿名',
  time: 1000,
  excerpt: '<script>旅行</script>',
};
const mock = vi.mocked(searchChats);
async function submit() {
  await userEvent.type(screen.getByLabelText(/検索語/), '京都 旅行');
  await userEvent.click(screen.getByRole('button', { name: '検索' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.mockResolvedValue({ items: [item], elapsedMs: 1, nextCursor: null });
});
describe('部屋の過去ログ検索', () => {
  it('本文をテキストで表示し検索語を計測イベントに含めない', async () => {
    const { container } = render(<ChatSearchPanel roomId="superbeginner" onBack={vi.fn()} />);
    await submit();
    expect(await screen.findByText(item.excerpt)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain('京都');
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'superbeginner', rangeDays: 30 }),
      expect.any(AbortSignal)
    );
  });
  it('IME変換確定時に検索しない', async () => {
    render(<ChatSearchPanel roomId="superbeginner" onBack={vi.fn()} />);
    const input = screen.getByLabelText(/検索語/);
    fireEvent.change(input, { target: { value: '京都' } });
    fireEvent.compositionStart(input);
    fireEvent.submit(input.closest('form')!);
    expect(mock).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.submit(input.closest('form')!);
    await screen.findByText(item.excerpt);
  });
  it('条件変更後に遅れて返った結果を表示しない', async () => {
    let resolve!: (value: { items: (typeof item)[]; elapsedMs: number; nextCursor: null }) => void;
    mock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    render(<ChatSearchPanel roomId="superbeginner" onBack={vi.fn()} />);
    await submit();
    fireEvent.change(screen.getByLabelText('検索期間'), { target: { value: '90' } });
    await act(async () => resolve({ items: [item], elapsedMs: 1, nextCursor: null }));
    expect(screen.queryByText(item.excerpt)).not.toBeInTheDocument();
    expect(mock.mock.calls[0][1].aborted).toBe(true);
  });
  it('ページ境界の重複を除外する', async () => {
    mock.mockResolvedValueOnce({ items: [item], elapsedMs: 1, nextCursor: 'next' });
    mock.mockResolvedValueOnce({
      items: [item, { ...item, uuid: 'two', excerpt: '次の発言' }],
      elapsedMs: 1,
      nextCursor: null,
    });
    render(<ChatSearchPanel roomId="superbeginner" onBack={vi.fn()} />);
    await submit();
    await userEvent.click(await screen.findByRole('button', { name: 'さらに表示' }));
    await screen.findByText('次の発言');
    expect(screen.getAllByText(item.excerpt)).toHaveLength(1);
  });
  it('削除された結果を開いたら古い本文を除去する', async () => {
    render(<ChatSearchPanel roomId="superbeginner" onBack={vi.fn()} />);
    await submit();
    mock.mockRejectedValueOnce(new Error('発言が見つかりません。'));
    await userEvent.click(await screen.findByRole('button', { name: '前後の発言を見る' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('発言が見つかりません');
    expect(screen.queryByText(item.excerpt)).not.toBeInTheDocument();
  });
  it('フォーカス復帰で再検索し、削除済みの結果を復活させない', async () => {
    render(<ChatSearchPanel roomId="superbeginner" onBack={vi.fn()} />);
    await submit();
    await screen.findByText(item.excerpt);
    mock.mockResolvedValueOnce({ items: [], elapsedMs: 1, nextCursor: null });
    fireEvent.focus(window);
    await screen.findByText('該当する発言はありません。');
    expect(screen.queryByText(item.excerpt)).not.toBeInTheDocument();
  });
  it('失敗を0件として表示せず現在の会話へ戻れる', async () => {
    const onBack = vi.fn();
    mock.mockRejectedValue(new Error('検索を一時停止しています。'));
    render(<ChatSearchPanel roomId="superbeginner" onBack={onBack} />);
    await submit();
    await screen.findByRole('alert');
    expect(screen.queryByText('該当する発言はありません。')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('現在の会話へ戻る'));
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  });
});
