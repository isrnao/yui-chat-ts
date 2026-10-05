import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import FilterListDialog from './index';
import { addFilteredIp, getFilteredIps } from '@features/chat/utils/ipFilterStore';

const noop = () => {};

describe('FilterListDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('モーダルの「フィルタ」として開き、閉じるボタンにフォーカスする', () => {
    render(<FilterListDialog ips={['a']} hiddenCounts={new Map()} onClose={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'フィルタ（1）' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus();
  });

  it('フィルタが空なら案内を出す', () => {
    render(<FilterListDialog ips={[]} hiddenCounts={new Map()} onClose={noop} />);
    expect(screen.getByRole('dialog', { name: 'フィルタ' })).toBeInTheDocument();
    expect(screen.getByText(/フィルタしている IP はありません。/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('1 行に「おなまえ」と「IP・件数」と解除を出す。1 件なら「すべて解除」は出さない', () => {
    render(
      <FilterListDialog
        ips={['219.*.*.253']}
        hiddenCounts={new Map([['219.*.*.253', 3]])}
        hiddenNames={new Map([['219.*.*.253', ['たろう', 'じろう']]])}
        onClose={noop}
      />
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('たろう、じろう')).toBeInTheDocument();
    expect(within(item).getByText('219.*.*.253・3 件')).toBeInTheDocument();
    expect(
      within(item).getByRole('button', { name: '219.*.*.253 のフィルタを解除' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'すべて解除' })).not.toBeInTheDocument();
  });

  it('保存した「おなまえ」を今のログの名前の後ろに重複なく続け、どちらにもなければ —', () => {
    render(
      <FilterListDialog
        ips={['219.*.*.253', '2001:*', '10.*.*.1']}
        hiddenCounts={new Map()}
        hiddenNames={new Map([['219.*.*.253', ['たろう']]])}
        savedNames={
          new Map([
            ['219.*.*.253', ['じろう', 'たろう']],
            ['2001:*', ['はなこ']],
          ])
        }
        onClose={noop}
      />
    );
    const [first, second, third] = screen.getAllByRole('listitem');
    expect(within(first!).getByText('たろう、じろう')).toBeInTheDocument();
    // ログから流れても、保存した名前で出せる
    expect(within(second!).getByText('はなこ')).toBeInTheDocument();
    expect(within(second!).getByText('2001:*・0 件')).toBeInTheDocument();
    expect(within(third!).getByText('—')).toBeInTheDocument();
  });

  it('解除とすべて解除はストアを書き換える', () => {
    addFilteredIp('a');
    addFilteredIp('b');
    addFilteredIp('c');
    const { rerender } = render(
      <FilterListDialog ips={getFilteredIps()} hiddenCounts={new Map()} onClose={noop} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'b のフィルタを解除' }));
    expect(getFilteredIps()).toEqual(['a', 'c']);

    rerender(<FilterListDialog ips={getFilteredIps()} hiddenCounts={new Map()} onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'すべて解除' }));
    expect(getFilteredIps()).toEqual([]);
  });

  it('×・Esc・背景のクリックで閉じる。窓の中のクリックでは閉じない', () => {
    const onClose = vi.fn();
    render(<FilterListDialog ips={[]} hiddenCounts={new Map()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    fireEvent.click(screen.getByText(/フィルタしている IP はありません/));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
