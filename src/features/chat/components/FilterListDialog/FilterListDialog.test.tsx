import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import FilterListDialog from './index';
import {
  addFilteredIp,
  addFilteredName,
  addFilteredWord,
  getSnapshot,
  type FilterEntry,
} from '@features/chat/utils/ipFilterStore';

const noop = () => {};
const ip = (value: string, names: string[] = []): FilterEntry => ({
  kind: 'ip',
  ip: value,
  names,
});

describe('FilterListDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('モーダルの「フィルタ」として開き、閉じるボタンにフォーカスする', () => {
    render(<FilterListDialog entries={[ip('a')]} hiddenCounts={new Map()} onClose={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'フィルタ（1）' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus();
  });

  it('フィルタが空なら案内を出す', () => {
    render(<FilterListDialog entries={[]} hiddenCounts={new Map()} onClose={noop} />);
    expect(screen.getByRole('dialog', { name: 'フィルタ' })).toBeInTheDocument();
    expect(screen.getByText(/フィルタしているものはありません。/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('IP の行は「おなまえ」と「IP・件数」と解除。1 件なら「すべて解除」は出さない', () => {
    render(
      <FilterListDialog
        entries={[ip('219.*.*.253')]}
        hiddenCounts={new Map([['ip:219.*.*.253', 3]])}
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

  it('IP の行は、保存した「おなまえ」を今のログの名前の後ろに重複なく続け、どちらにもなければ —', () => {
    render(
      <FilterListDialog
        entries={[
          ip('219.*.*.253', ['じろう', 'たろう']),
          ip('2001:*', ['はなこ']),
          ip('10.*.*.1'),
        ]}
        hiddenCounts={new Map()}
        hiddenNames={new Map([['219.*.*.253', ['たろう']]])}
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

  it('名前と言葉の行は、見出しと「名前・件数」「言葉・件数」を出す', () => {
    render(
      <FilterListDialog
        entries={[
          { kind: 'name', name: 'たろう' },
          { kind: 'word', word: 'うざい' },
        ]}
        hiddenCounts={
          new Map([
            ['name:たろう', 2],
            ['word:うざい', 5],
          ])
        }
        onClose={noop}
      />
    );
    const [name, word] = screen.getAllByRole('listitem');
    expect(within(name!).getByText('たろう')).toBeInTheDocument();
    expect(within(name!).getByText('名前・2 件')).toBeInTheDocument();
    expect(
      within(name!).getByRole('button', { name: '名前「たろう」のフィルタを解除' })
    ).toBeInTheDocument();
    expect(within(word!).getByText('「うざい」')).toBeInTheDocument();
    expect(within(word!).getByText('言葉・5 件')).toBeInTheDocument();
    expect(
      within(word!).getByRole('button', { name: '言葉「うざい」のフィルタを解除' })
    ).toBeInTheDocument();
  });

  it('解除とすべて解除はストアを書き換える', () => {
    addFilteredIp('a');
    addFilteredName('b');
    addFilteredWord('c');
    const { rerender } = render(
      <FilterListDialog entries={getSnapshot()} hiddenCounts={new Map()} onClose={noop} />
    );
    fireEvent.click(screen.getByRole('button', { name: '名前「b」のフィルタを解除' }));
    expect(getSnapshot().map((entry) => entry.kind)).toEqual(['ip', 'word']);

    rerender(<FilterListDialog entries={getSnapshot()} hiddenCounts={new Map()} onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'すべて解除' }));
    expect(getSnapshot()).toEqual([]);
  });

  it('×・Esc・背景のクリックで閉じる。窓の中のクリックでは閉じない', () => {
    const onClose = vi.fn();
    render(<FilterListDialog entries={[]} hiddenCounts={new Map()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    fireEvent.click(screen.getByText(/フィルタしているものはありません/));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
