import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModalShell from './index';

/** 背後にリンクと「開く」ボタンがあるページ。ボタンで窓を開き、窓の中のボタンで閉じる */
function Page({ onCancel = () => {} }: { onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onCancel();
    setOpen(false);
  };
  return (
    <>
      <a href="#behind">背後のリンク</a>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      {open && (
        <ModalShell labelledBy="t" onCancel={close}>
          <p id="t">見出し</p>
          <button type="button" autoFocus>
            一つ目
          </button>
          <button type="button" onClick={close}>
            二つ目
          </button>
        </ModalShell>
      )}
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
  it('document.body の直下に出し、開いている間は背後を inert にする。閉じたら戻す', () => {
    const { container } = render(<Page />);
    openDialog();
    const dialog = screen.getByRole('dialog', { name: '見出し' });
    expect(dialog.parentElement!.parentElement).toBe(document.body);
    expect(container.inert).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '二つ目' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.inert).toBe(false);
  });

  it('Tab / Shift+Tab は窓の中で回す', () => {
    render(<Page />);
    openDialog();
    const first = screen.getByRole('button', { name: '一つ目' });
    const second = screen.getByRole('button', { name: '二つ目' });
    expect(first).toHaveFocus();

    second.focus();
    expect(fireEvent.keyDown(second, { key: 'Tab' })).toBe(false);
    expect(first).toHaveFocus();
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(second).toHaveFocus();
    // 端でない Tab はブラウザに任せる
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
  });

  it('フォーカスが窓の外にあっても Esc で閉じる', () => {
    const onCancel = vi.fn();
    render(<Page onCancel={onCancel} />);
    openDialog();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('閉じたら、開く前にフォーカスしていた要素へ戻す', () => {
    render(<Page />);
    const opener = openDialog();
    fireEvent.click(screen.getByRole('button', { name: '二つ目' }));
    expect(opener).toHaveFocus();
  });

  it('開く前の要素が消えていたらフォーカスを戻さない', () => {
    function Vanishing() {
      const [open, setOpen] = useState(false);
      return (
        <>
          {!open && (
            <button type="button" onClick={() => setOpen(true)}>
              開く
            </button>
          )}
          {open && (
            <ModalShell labelledBy="t" onCancel={() => setOpen(false)}>
              <p id="t">見出し</p>
              <button type="button" autoFocus onClick={() => setOpen(false)}>
                閉じる
              </button>
            </ModalShell>
          )}
        </>
      );
    }
    render(<Vanishing />);
    openDialog();
    expect(() => fireEvent.click(screen.getByRole('button', { name: '閉じる' }))).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});
