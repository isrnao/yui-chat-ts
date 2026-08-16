import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

/**
 * 上側に表示している画面の種類。初期高さの出し分けに使う。
 * top 要素からコンポーネント名を推測すると Fragment やラッパー div で判定不能になり、
 * 本番ビルドの minify でも壊れるため、呼び出し側から明示的に渡す。
 */
export type SplitterTopKind = 'chat' | 'entry';

/** Tailwind の lg (64rem) と同じ閾値。inline style ではブレークポイントが効かないため JS で判定する */
const DESKTOP_MEDIA_QUERY = '(min-width: 64rem)';

/** topKind 未指定時の初期高さ(%) */
const FALLBACK_TOP_HEIGHT = 30;

/** 初期高さ(%)。desktop 未指定ならビューポート幅によらず base を使う */
type TopHeightPreset = { base: number; desktop?: number };

const TOP_HEIGHT_PRESETS: Record<SplitterTopKind, TopHeightPreset> = {
  chat: { base: 18 },
  entry: { base: 26, desktop: 24 },
};

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DESKTOP_MEDIA_QUERY).matches === true;
}

function resolveInitialTopHeight(topKind: SplitterTopKind | undefined): number {
  if (topKind == null) return FALLBACK_TOP_HEIGHT;
  const preset = TOP_HEIGHT_PRESETS[topKind];
  return isDesktopViewport() ? (preset.desktop ?? preset.base) : preset.base;
}

export default function RetroSplitter({
  top,
  bottom,
  topKind,
  minTop = 10,
  minBottom = 10,
}: {
  top: ReactNode;
  bottom: ReactNode;
  /** 上側の画面の種類。初期高さの出し分けに使う（未指定なら 30%） */
  topKind?: SplitterTopKind;
  minTop?: number;
  minBottom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 上側の画面に応じて初期高さを決定（マウント時のみ参照）
  const [topHeight, setTopHeight] = useState(() => resolveInitialTopHeight(topKind)); // percent
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

  // 入室前後で上側の画面が入れ替わったら初期高さに戻す
  // useResetOnChange = effect 内 setState を避ける公式推奨「前回値検知」パターン
  useResetOnChange(topKind, (next) => {
    setTopHeight(resolveInitialTopHeight(next));
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
