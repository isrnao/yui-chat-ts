import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('<Modal />', () => {
  it('open=falseのときは何も表示しない', () => {
    const { container } = render(<Modal open={false}>Hello</Modal>);
    expect(container).toBeEmptyDOMElement();
  });

  it('open=trueでchildrenが表示される', () => {
    render(<Modal open={true}>Hello Modal</Modal>);
    expect(screen.getByText('Hello Modal')).toBeInTheDocument();
  });

  it('aria属性が正しい', () => {
    render(
      <Modal open={true} ariaLabel="Test Modal">
        Test
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Test Modal');
  });

  it('onCloseで閉じられる（×ボタン）', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        modal content
      </Modal>
    );
    // ×ボタンをクリック
    const closeBtn = screen.getByLabelText('閉じる');
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('overlayクリックでonCloseが呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        test
      </Modal>
    );
    // オーバーレイ（黒背景）をクリック
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('内容部をクリックしてもonCloseは呼ばれない', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        test
      </Modal>
    );
    // 内部のdiv
    const dialog = screen.getByRole('dialog');
    const inner = dialog.querySelector('div[tabindex="-1"]')!;
    fireEvent.click(inner);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('EscキーでonCloseが呼ばれる', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        test
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('open時はbodyのoverflow:hidden、閉じると解除', () => {
    // 初期状態
    document.body.style.overflow = '';
    const { rerender, unmount } = render(<Modal open={true}>test</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    // 閉じる
    rerender(<Modal open={false}>test</Modal>);
    expect(document.body.style.overflow).toBe('');
    // アンマウント時も解除
    rerender(<Modal open={true}>test</Modal>);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
