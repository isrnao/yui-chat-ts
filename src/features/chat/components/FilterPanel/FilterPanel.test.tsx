import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPanel from './index';
import { addFilteredIp, getSnapshot } from '@features/chat/utils/ipFilterStore';

describe('FilterPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('フィルタが空なら案内を出す', () => {
    render(<FilterPanel ips={[]} hiddenCounts={new Map()} />);
    expect(screen.getByText(/フィルタしている IP はありません。/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('IP ごとに隠れている発言の数と解除ボタンを出す。1 件なら「すべて解除」は出さない', () => {
    render(<FilterPanel ips={['219.*.*.253']} hiddenCounts={new Map([['219.*.*.253', 3]])} />);
    expect(screen.getByText('219.*.*.253')).toBeInTheDocument();
    expect(screen.getByText('3 件')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '219.*.*.253 のフィルタを解除' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'すべて解除' })).not.toBeInTheDocument();
  });

  it('現在のログに一致する発言がなければ 0 件', () => {
    render(<FilterPanel ips={['2001:*']} hiddenCounts={new Map()} />);
    expect(screen.getByText('0 件')).toBeInTheDocument();
  });

  it('解除とすべて解除はストアを書き換える', () => {
    addFilteredIp('a');
    addFilteredIp('b');
    addFilteredIp('c');
    const { rerender } = render(<FilterPanel ips={getSnapshot()} hiddenCounts={new Map()} />);
    fireEvent.click(screen.getByRole('button', { name: 'b のフィルタを解除' }));
    expect(getSnapshot()).toEqual(['a', 'c']);

    rerender(<FilterPanel ips={getSnapshot()} hiddenCounts={new Map()} />);
    fireEvent.click(screen.getByRole('button', { name: 'すべて解除' }));
    expect(getSnapshot()).toEqual([]);
  });

  it('見出しのリンクでログ表示へ戻る', () => {
    const onBack = vi.fn();
    render(<FilterPanel ips={[]} hiddenCounts={new Map()} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'フィルタ' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
