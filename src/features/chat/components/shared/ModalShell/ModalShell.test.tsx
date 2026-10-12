import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModalShell from './index';
import { pressBackdrop } from '../../../../../test/dialog';

/** 「開く」ボタンで窓を開き、窓の中のボタンで閉じるページ */
function Page({
  onCancel = () => {},
  returnFocus,
}: {
  onCancel?: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onCancel();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      <div data-chat-log-root="" tabIndex={-1}>
        ログ
      </div>
      <ModalShell open={open} labelledBy="t" onCancel={close} returnFocus={returnFocus}>
        <p id="t">見出し</p>
        <button type="button">一つ目</button>
        <button type="button" data-dialog-initial-focus onClick={close}>
          やめる
        </button>
      </ModalShell>
    </>
  );
}

function openDialog() {
  const opener = screen.getByRole('button', { name: '開く' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('ModalShell', () => {
  it('open で showModal() し、安全な取消ボタンにフォーカスする', () => {
    render(<Page />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openDialog();
    expect(screen.getByRole('dialog', { name: '見出し' })).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'やめる' })).toHaveFocus();
  });

  it('Esc と背景のクリックは onCancel を呼び、窓の中のクリックでは呼ばない', () => {
    const onCancel = vi.fn();
    render(<Page onCancel={onCancel} />);
    openDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openDialog();
    fireEvent.click(screen.getByRole('button', { name: '一つ目' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    pressBackdrop(screen.getByRole('dialog'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('背景で押し始めていないクリック（開いた操作の続き）では閉じない', () => {
    const onCancel = vi.fn();
    render(<Page onCancel={onCancel} />);
    openDialog();
    fireEvent.click(screen.getByRole('dialog'), { clientX: -1, clientY: -1 });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('閉じたら、開く前にフォーカスしていた要素へ戻す', () => {
    render(<Page />);
    const opener = openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(opener).toHaveFocus();
  });

  it('returnFocus を渡したらそちらへ戻す', () => {
    const target = document.createElement('button');
    document.body.append(target);
    render(<Page returnFocus={() => target} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(target).toHaveFocus();
    target.remove();
  });

  it('開く前の要素が消えていたらログ領域へ戻す', () => {
    function Vanishing() {
      const [open, setOpen] = useState(false);
      return (
        <>
          {!open && (
            <button type="button" onClick={() => setOpen(true)}>
              開く
            </button>
          )}
          <div data-chat-log-root="" tabIndex={-1}>
            ログ
          </div>
          <ModalShell open={open} labelledBy="t" onCancel={() => setOpen(false)}>
            <p id="t">見出し</p>
            <button type="button" data-dialog-initial-focus onClick={() => setOpen(false)}>
              閉じる
            </button>
          </ModalShell>
        </>
      );
    }
    render(<Vanishing />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.getByText('ログ')).toHaveFocus();
  });
});
