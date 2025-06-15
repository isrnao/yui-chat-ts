// RetroSplitter.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RetroSplitter from './RetroSplitter';

function getPercentHeight(div: HTMLElement) {
  // style="height: XX%"
  return Number(div.style.height.replace('%', ''));
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
    const bottomDiv = screen.getByText('BB').parentElement as HTMLElement;
    expect(getPercentHeight(topDiv)).toBeGreaterThanOrEqual(20);
    expect(getPercentHeight(bottomDiv)).toBeGreaterThanOrEqual(30);
  });

  it('sets initial topHeight based on top element type', () => {
    // 名前ChatRoomなら18%、他なら26%
    function ChatRoom() {
      return <div>chat</div>;
    }
    const { rerender } = render(<RetroSplitter top={<ChatRoom />} bottom={<div>BB</div>} />);
    let topDiv = screen.getByText('chat').parentElement as HTMLElement;
    expect(getPercentHeight(topDiv)).toBeCloseTo(18, 1);

    function Dummy() {
      return <div>dummy</div>;
    }
    rerender(<RetroSplitter top={<Dummy />} bottom={<div>BB</div>} />);
    topDiv = screen.getByText('dummy').parentElement as HTMLElement;
    expect(getPercentHeight(topDiv)).toBeCloseTo(26, 1);
  });
});
