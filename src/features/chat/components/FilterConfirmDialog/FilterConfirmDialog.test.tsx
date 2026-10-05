import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterConfirmDialog from './index';

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<FilterConfirmDialog ip="219.*.*.253" onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
}

describe('FilterConfirmDialog', () => {
  it('IP を見出しにした確認の窓を出し、「やめる」にフォーカスする', () => {
    setup();
    const dialog = screen.getByRole('alertdialog', {
      name: '219.*.*.253 の発言をフィルタ（非表示に）しますか？',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(
      '同じ IP の発言がすべて隠れます。「フィルタ」から解除できます。'
    );
    expect(screen.getByRole('button', { name: 'やめる' })).toHaveFocus();
  });

  it('「フィルタする」に透明な switch を重ね、指で押すと確定する（iOS のハプティック）', () => {
    const { onConfirm } = setup();
    const haptic = screen.getByTestId('filter-confirm-haptic-switch');
    expect(haptic).toHaveAttribute('type', 'checkbox');
    expect(haptic).toHaveAttribute('switch');
    // キーボードと支援技術はボタンを使う
    expect(haptic).toHaveAttribute('tabindex', '-1');
    expect(haptic).toHaveAttribute('aria-hidden', 'true');
    // 重ねた switch はボタンと同じ枠に入っている
    expect(haptic.parentElement).toContainElement(
      screen.getByRole('button', { name: 'フィルタする' })
    );

    fireEvent.click(haptic);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('キーボードでは「フィルタする」ボタンで確定する', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'フィルタする' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('「やめる」・Esc・背景のクリックでやめる。窓の中のクリックではやめない', () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    const backdrop = screen.getByRole('alertdialog').parentElement!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    fireEvent.click(screen.getByText(/同じ IP の発言/));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('開いた操作の続きのクリック（タッチの互換用の click）が背景に届いても閉じない', () => {
    // タッチのダブルタップで開くと、その指の下に窓の背景が来る。押し始めは発言の行なので、背景の上で
    // pointerdown は起きていない
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('alertdialog').parentElement!);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
