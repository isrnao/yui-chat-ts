import { useId, useRef, useState, useEffect, useLayoutEffect } from 'react';
import type { ReactNode, KeyboardEvent, PointerEvent, CSSProperties } from 'react';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export type SplitterTopKind = 'chat' | 'entry';
const PRESETS = { chat: { base: 18, desktop: 18 }, entry: { base: 26, desktop: 24 } };

export default function RetroSplitter({
  top,
  bottom,
  topKind,
  minTop = 10,
  minBottom = 10,
  bottomScrollable = true,
}: {
  top: ReactNode;
  bottom: ReactNode;
  topKind?: SplitterTopKind;
  minTop?: number;
  minBottom?: number;
  bottomScrollable?: boolean;
}) {
  const paneId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const preset = topKind ? PRESETS[topKind] : { base: 30, desktop: 30 };
  const [adjusted, setAdjusted] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [metrics, setMetrics] = useState({ height: 0, cssTop: preset.base, bar: 5 });
  const geometry = useRef({ height: 0, top: 0, bar: 5 });
  const activePointer = useRef<number | null>(null);
  const lastPoint = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const styles = getComputedStyle(node);
      const cssTop = Number.parseFloat(styles.getPropertyValue('--splitter-top-h'));
      const bar = Number.parseFloat(styles.getPropertyValue('--splitter-bar-height')) || 5;
      geometry.current = { height: rect.height, top: rect.top, bar };
      setMetrics({
        height: rect.height,
        cssTop: Number.isFinite(cssTop) ? cssTop : preset.base,
        bar,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.children[1]) observer.observe(node.children[1]);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
      cancelFrame();
      activePointer.current = null;
      lastPoint.current = null;
    };
  }, [preset.base, preset.desktop]);
  useResetOnChange(topKind, () => {
    setAdjusted(null);
    setDragging(false);
  });
  const bounds = (height: number, bar: number) => {
    if (height <= 0) return { min: 0, max: 100 };
    const available = Math.max(0, height - bar);
    const floor = Math.min(minTop, available / 2);
    const ceiling = available - Math.min(minBottom, available / 2);
    return { min: (floor / height) * 100, max: (ceiling / height) * 100 };
  };
  const range = bounds(metrics.height, metrics.bar);
  const clamp = (value: number) => Math.max(range.min, Math.min(range.max, value));
  const value = clamp(adjusted ?? metrics.cssTop);
  const fromPoint = (clientY: number) => {
    const { height, top: offset, bar } = geometry.current;
    if (!height) return value;
    const limits = bounds(height, bar);
    return Math.max(limits.min, Math.min(limits.max, ((clientY - offset) / height) * 100));
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false || activePointer.current !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    lastPoint.current = null;
    setDragging(true);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    lastPoint.current = event.clientY;
    const y = event.clientY;
    cancelFrame();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setAdjusted(fromPoint(y));
    });
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    cancelFrame();
    if (event.type === 'pointerup' && lastPoint.current !== null)
      setAdjusted(fromPoint(lastPoint.current));
    activePointer.current = null;
    lastPoint.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    if (!dragging) return;
    const previous = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = previous.cursor;
      document.body.style.userSelect = previous.userSelect;
    };
  }, [dragging]);
  const onKeyDown = (event: KeyboardEvent) => {
    let next: number;
    if (event.key === 'ArrowUp') next = value - 2;
    else if (event.key === 'ArrowDown') next = value + 2;
    else if (event.key === 'Home') next = range.min;
    else if (event.key === 'End') next = range.max;
    else return;
    event.preventDefault();
    setAdjusted(clamp(next));
  };
  return (
    <div
      ref={containerRef}
      className="splitter-panes grid flex-1 min-h-0 h-full"
      data-dragging={dragging || undefined}
      style={
        {
          '--splitter-top-base': `${preset.base}%`,
          '--splitter-top-desktop': `${preset.desktop}%`,
          '--splitter-min-top': `min(${minTop}px, calc((100% - var(--splitter-bar-height, 5px)) / 2))`,
          '--splitter-min-bottom': `min(${minBottom}px, calc((100% - var(--splitter-bar-height, 5px)) / 2))`,
          ...(adjusted === null ? {} : { '--splitter-top-h': `${value}%` }),
          gridTemplateRows:
            'clamp(var(--splitter-min-top), var(--splitter-top-h), calc(100% - var(--splitter-bar-height, 5px) - var(--splitter-min-bottom))) var(--splitter-bar-height, 5px) minmax(0, 1fr)',
        } as CSSProperties
      }
    >
      <div
        id={paneId}
        className="splitter-top min-h-0 overflow-y-auto px-[var(--page-gap)] pb-[var(--page-gap)]"
      >
        {top}
      </div>
      <div
        role="separator"
        aria-label="上下の領域を分割するバー"
        aria-description="上下の境界です。矢印キーで調整できます"
        aria-orientation="horizontal"
        aria-controls={paneId}
        aria-valuenow={Math.round(value)}
        aria-valuemin={Math.round(range.min)}
        aria-valuemax={Math.round(range.max)}
        tabIndex={0}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={onKeyDown}
        style={{ touchAction: 'none' }}
        className="bleed-x cursor-row-resize flex items-center"
      >
        <hr className="border-0 border-t-4 border-b border-t-ie-gray border-b-white w-full" />
      </div>
      <div
        className={`splitter-bottom min-h-0 ${bottomScrollable ? 'overflow-y-auto' : 'overflow-hidden'}`}
        data-log-scroll=""
      >
        {bottom}
      </div>
    </div>
  );
}
