// RetroSplitter.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RetroSplitter from './index';

/**
 * 実効の上側高さ(%)を得る。
 *
 * 高さは CSS 変数経由で決まる (SSG と hydration で値が食い違わないよう、
 * ビューポート出し分けを CSS のメディアクエリに任せているため)。
 * 操作後は --splitter-top-h が入り、未操作なら --splitter-top-base が実効値になる
 * (jsdom はメディアクエリを適用しないので desktop 値は当たらない)。
 */
function getPercentHeight(node: HTMLElement) {
  const panes = node.closest('.splitter-panes') as HTMLElement | null;
  const target = panes ?? node;
  const adjusted = target.style.getPropertyValue('--splitter-top-h');
  const base = target.style.getPropertyValue('--splitter-top-base');
  return Number((adjusted || base).replace('%', ''));
}

describe('RetroSplitter', () => {
  beforeEach(() => {
    // JSDOMではgetBoundingClientRectは0になるので、モック
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      // 高さ500pxのコンテナを想定
      return {
        top: 0,
        left: 0,
        width: 800,
        height: 500,
        bottom: 500,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      };
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: Parameters<typeof window.requestAnimationFrame>[0]) => {
        cb(0);
        return 0;
      }
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders both top and bottom nodes', () => {
    render(<RetroSplitter top={<div>TOP!</div>} bottom={<div>BOTTOM!</div>} />);
    expect(screen.getByText('TOP!')).toBeInTheDocument();
    expect(screen.getByText('BOTTOM!')).toBeInTheDocument();
  });

  it('topHeight percent is default 30', () => {
    render(<RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} />);
    // 最初のdiv: top
    const topDiv = screen.getByText('TT').parentElement as HTMLElement;
    expect(getPercentHeight(topDiv)).toBeCloseTo(30, 1);
  });

  it('split bar is focusable and keyboard accessible', () => {
    render(<RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} />);
    const separators = screen.getAllByRole('separator');
    // aria-label指定があるほうが操作バー
    const separator = separators.find(
      (sep) => sep.getAttribute('aria-label') === '上下の領域を分割するバー'
    );
    expect(separator).toHaveAttribute('tabindex', '0');
    separator!.focus();
    expect(document.activeElement).toBe(separator);
    fireEvent.keyDown(separator!, { key: 'ArrowUp' });
    fireEvent.keyDown(separator!, { key: 'ArrowDown' });
  });

  it('dragging bar updates topHeight', () => {
    render(<RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} />);
    const separators = screen.getAllByRole('separator');
    const separator = separators.find(
      (sep) => sep.getAttribute('aria-label') === '上下の領域を分割するバー'
    );
    fireEvent.mouseDown(separator!);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }));
    });
    const topDiv = screen.getByText('TT').parentElement as HTMLElement;
    expect(getPercentHeight(topDiv)).toBeCloseTo(80, 1);
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
  });

  // select-none を常時付けると、チャットログを含む全チャット欄で文字が選択できず
  // 右クリックからのコピーも効かなくなる
  it('通常時はチャット欄のテキストを選択できる', () => {
    render(<RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} />);
    const panes = screen.getByText('TT').closest('.splitter-panes') as HTMLElement;

    expect(panes.className).not.toContain('select-none');
    expect(document.body.style.userSelect).toBe('');
  });

  it('ドラッグ中だけテキスト選択を止め、終了で元に戻す', () => {
    render(<RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} />);
    const separator = screen
      .getAllByRole('separator')
      .find((sep) => sep.getAttribute('aria-label') === '上下の領域を分割するバー');

    fireEvent.mouseDown(separator!);
    expect(document.body.style.userSelect).toBe('none');

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(document.body.style.userSelect).toBe('');
  });

  it('ドラッグ中にアンマウントされても選択禁止を残さない', () => {
    const { unmount } = render(<RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} />);
    const separator = screen
      .getAllByRole('separator')
      .find((sep) => sep.getAttribute('aria-label') === '上下の領域を分割するバー');

    fireEvent.mouseDown(separator!);
    expect(document.body.style.userSelect).toBe('none');

    unmount();
    expect(document.body.style.userSelect).toBe('');
  });

  it('respects minTop and minBottom constraints', () => {
    render(
      <RetroSplitter top={<div>TT</div>} bottom={<div>BB</div>} minTop={100} minBottom={150} />
    );
    const separators = screen.getAllByRole('separator');
    const separator = separators.find(
      (sep) => sep.getAttribute('aria-label') === '上下の領域を分割するバー'
    );
    fireEvent.mouseDown(separator!);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 499 }));
    });
    const topDiv = screen.getByText('TT').parentElement as HTMLElement;
    const topPercent = getPercentHeight(topDiv);
    expect(topPercent).toBeGreaterThanOrEqual(20);
    // 下側は calc(100% - 上側) なので、上側の上限で担保する
    expect(100 - topPercent).toBeGreaterThanOrEqual(30);
  });

  it('sets initial topHeight based on topKind', () => {
    // chat なら18%、entry なら26%（SP幅）
    const { rerender } = render(
      <RetroSplitter topKind="chat" top={<div>TT</div>} bottom={<div>BB</div>} />
    );
    const topDiv = screen.getByText('TT').parentElement as HTMLElement;
    expect(getPercentHeight(topDiv)).toBeCloseTo(18, 1);

    // 入室前後の切り替えで初期高さに戻る
    rerender(<RetroSplitter topKind="entry" top={<div>TT</div>} bottom={<div>BB</div>} />);
    expect(getPercentHeight(topDiv)).toBeCloseTo(26, 1);
  });

  // ビューポート出し分けは CSS のメディアクエリ (.splitter-panes) が担う。
  // JS で matchMedia を見ると SSG と hydration で値が食い違い、デスクトップで
  // 必ずレイアウトシフトが出るため、JS の責務は変数を渡すところまで。
  it('デスクトップ用のプリセットを CSS 変数として渡す', () => {
    render(<RetroSplitter topKind="entry" top={<div>TT</div>} bottom={<div>BB</div>} />);
    const panes = (screen.getByText('TT').closest('.splitter-panes') as HTMLElement) ?? null;

    expect(panes).not.toBeNull();
    expect(panes!.style.getPropertyValue('--splitter-top-base')).toBe('26%');
    expect(panes!.style.getPropertyValue('--splitter-top-desktop')).toBe('24%');
    // 未操作のうちは inline の実効値を持たない (CSS が決める)
    expect(panes!.style.getPropertyValue('--splitter-top-h')).toBe('');
  });
});
