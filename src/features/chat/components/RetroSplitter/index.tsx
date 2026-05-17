import { useRef, useState, useCallback, useEffect, useLayoutEffect, isValidElement } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

function getTopTypeName(top: ReactNode, bottom: ReactNode): string | null {
  if (top && bottom && isValidElement(top) && typeof top.type === 'function') {
    return top.type.name;
  }
  return null;
}

function resolveInitialTopHeight(top: ReactNode, bottom: ReactNode): number {
  const name = getTopTypeName(top, bottom);
  if (name == null) return 30;
  return name === 'ChatRoom' ? 18 : 26;
}

export default function RetroSplitter({
  top,
  bottom,
  minTop = 10,
  minBottom = 10,
}: {
  top: ReactNode;
  bottom: ReactNode;
  minTop?: number;
  minBottom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // top コンポーネントの種類に応じて初期高さを決定（マウント時のみ参照）
  const [topHeight, setTopHeight] = useState(() => resolveInitialTopHeight(top, bottom)); // percent
  const [dragging, setDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  const metricsRef = useRef({ height: 0, top: 0 });
  const [metrics, setMetrics] = useState({ height: 0, top: 0 });
  const topHeightRef = useRef(topHeight);

  useEffect(() => {
    topHeightRef.current = topHeight;
  }, [topHeight]);

  // 親要素のジオメトリ変化をバッチで検知
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateMetrics = () => {
      const rect = node.getBoundingClientRect();
      const nextMetrics = { height: rect.height, top: rect.top };
      metricsRef.current = nextMetrics;
      setMetrics((prev) => {
        const heightDiff = Math.abs(prev.height - nextMetrics.height);
        const topDiff = Math.abs(prev.top - nextMetrics.top);
        return heightDiff > 0.5 || topDiff > 0.5 ? nextMetrics : prev;
      });
    };

    updateMetrics();

    const observer = new ResizeObserver(() => {
      updateMetrics();
    });
    observer.observe(node);

    const handleViewportChange = () => updateMetrics();
    window.addEventListener('scroll', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, []);

  // パーセント計算ロジック分離
  const calcPercent = useCallback(
    (clientY: number) => {
      const { height, top } = metricsRef.current;
      if (!height) return topHeightRef.current;
      let percent = ((clientY - top) / height) * 100;
      percent = Math.max((minTop / height) * 100, percent);
      percent = Math.min(100 - (minBottom / height) * 100, percent);
      return percent;
    },
    [minTop, minBottom]
  );

  // ドラッグ中マウスmove
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const { clientY } = e;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      rafRef.current = requestAnimationFrame(() => {
        setTopHeight(calcPercent(clientY));
      });
    },
    [calcPercent]
  );
  // ドラッグ解除
  const onMouseUp = useCallback(() => {
    setDragging(false);
    document.body.style.cursor = '';
  }, []);

  // イベントリスナーの追加/解除
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
    };
  }, [dragging, onMouseMove, onMouseUp]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  // top コンポーネントの種類が変わったら高さを初期化（ChatRoom と EntryForm で違うデフォルト）
  // useResetOnChange = effect 内 setState を避ける公式推奨「前回値検知」パターン
  const topTypeName = getTopTypeName(top, bottom);
  useResetOnChange(topTypeName, (next) => {
    if (next != null) {
      setTopHeight(next === 'ChatRoom' ? 18 : 26);
    }
  });

  // キーボード操作でもドラッグできるように
  const onBarKeyDown = (e: KeyboardEvent) => {
    const height = metrics.height || metricsRef.current.height || 1;
    if (e.key === 'ArrowUp') setTopHeight((h) => Math.min(h + 2, 100 - (minBottom / height) * 100));
    if (e.key === 'ArrowDown') setTopHeight((h) => Math.max(h - 2, (minTop / height) * 100));
  };

  const containerHeight = metrics.height;
  const minPercent = containerHeight ? (minTop / containerHeight) * 100 : 0;
  const maxPercent = containerHeight ? 100 - (minBottom / containerHeight) * 100 : 100;
  const clampedMinPercent = Math.max(0, Math.min(minPercent, 100));
  const clampedMaxPercent = Math.max(clampedMinPercent, Math.min(maxPercent, 100));

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col bg-transparent select-none min-h-0 h-full"
    >
      {/* 上側エリア */}
      <div
        className="overflow-y-auto px-[var(--page-gap)] pb-[var(--page-gap)]"
        style={{
          height: `${topHeight}%`,
          minHeight: minTop,
        }}
      >
        {top}
      </div>
      {/* 分割バー */}
      <div
        role="separator"
        aria-label="上下の領域を分割するバー"
        aria-description="上下の境界です。矢印キーで調整できます"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(topHeight)}
        aria-valuemin={Math.round(clampedMinPercent)}
        aria-valuemax={Math.round(clampedMaxPercent)}
        tabIndex={0}
        onMouseDown={() => setDragging(true)}
        onKeyDown={onBarKeyDown}
        className="bleed-x cursor-row-resize outline-none"
      >
        <hr className="border-0 border-t-4 border-b border-t-ie-gray border-b-white w-full" />
      </div>
      {/* 下側エリア */}
      <div
        className="overflow-y-auto min-h-0"
        style={{
          height: `${100 - topHeight}%`,
          minHeight: minBottom,
        }}
      >
        {bottom}
      </div>
    </div>
  );
}
