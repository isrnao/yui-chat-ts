import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import type { ReactNode, KeyboardEvent, PointerEvent, CSSProperties } from 'react';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

/**
 * 上側に表示している画面の種類。初期高さの出し分けに使う。
 * top 要素からコンポーネント名を推測すると Fragment やラッパー div で判定不能になり、
 * 本番ビルドの minify でも壊れるため、呼び出し側から明示的に渡す。
 */
export type SplitterTopKind = 'chat' | 'entry';

/*
 * 初期高さのブレークポイント (Tailwind の lg = 64rem) は src/styles/utilities.css の
 * .splitter-panes が持つ。JS で matchMedia を見ると SSG と hydration で値が
 * 食い違い、デスクトップで必ずレイアウトシフトが出るため CSS に寄せている。
 */

/** topKind 未指定時の初期高さ(%) */
const FALLBACK_TOP_HEIGHT = 30;

/** 初期高さ(%)。desktop 未指定ならビューポート幅によらず base を使う */
type TopHeightPreset = { base: number; desktop?: number };

const TOP_HEIGHT_PRESETS: Record<SplitterTopKind, TopHeightPreset> = {
  chat: { base: 18 },
  entry: { base: 26, desktop: 24 },
};

/** プリセット値 (%) を CSS 変数として渡す。ビューポート出し分けは CSS が行う。 */
function resolveTopHeightVars(topKind: SplitterTopKind | undefined): {
  base: number;
  desktop: number;
} {
  if (topKind == null) return { base: FALLBACK_TOP_HEIGHT, desktop: FALLBACK_TOP_HEIGHT };
  const preset = TOP_HEIGHT_PRESETS[topKind];
  return { base: preset.base, desktop: preset.desktop ?? preset.base };
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
  // 初期高さはビューポート出し分けを含めて CSS が決める (SSG と hydration で
  // 値が食い違わないようにするため)。JS は操作後の値だけを持つ。
  const topHeightVars = resolveTopHeightVars(topKind);
  const [adjustedTopHeight, setAdjustedTopHeight] = useState<number | null>(null);
  // 操作前は CSS が実効値を決めるので、JS からは base 値を近似として扱う
  // (aria-valuenow と、ドラッグ開始時の基準に使う)。
  const topHeight = adjustedTopHeight ?? topHeightVars.base; // percent
  const [dragging, setDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  const metricsRef = useRef({ height: 0, top: 0 });
  const [metrics, setMetrics] = useState({ height: 0, top: 0 });

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

  // ポインタの位置を上側の高さ(%)に変換する（最小の高さで上下を挟む）
  const calcPercent = (clientY: number) => {
    const { height, top } = metricsRef.current;
    if (!height) return topHeight;
    let percent = ((clientY - top) / height) * 100;
    percent = Math.max((minTop / height) * 100, percent);
    percent = Math.min(100 - (minBottom / height) * 100, percent);
    return percent;
  };

  // ドラッグは Pointer Events + setPointerCapture で扱う。マウス・タッチ・ペンのどれでも動き、
  // バーの外にポインタが出ても move / up がバーに届くので、window へリスナーを張らなくてよい
  // （以前はマウスしか扱えず、window の mousemove / mouseup と、その張り替えのための useCallback を持っていた）
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const { clientY } = e;
    // 1 フレームに 1 回だけ高さを更新する
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setAdjustedTopHeight(calcPercent(clientY));
    });
  };

  const stopDragging = () => setDragging(false);

  // ドラッグ中はカーソルと、テキスト選択の禁止を body に当てる（React の外の DOM への同期）。
  // バーの外にポインタが出ても選択範囲が伸びないよう body に当てる。以前は .splitter-panes に
  // select-none を常時付けており、チャットログ・入室フォームを含む全チャット欄で文字が選択できなかった
  useEffect(() => {
    if (!dragging) return;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

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
  useResetOnChange(topKind, () => {
    // null に戻すことで、新しい topKind のプリセット値に再び追随させる
    setAdjustedTopHeight(null);
  });

  // キーボード操作でもドラッグできるように
  const onBarKeyDown = (e: KeyboardEvent) => {
    const height = metrics.height || metricsRef.current.height || 1;
    const adjust = (delta: number, clamp: (value: number) => number) => {
      setAdjustedTopHeight((previous) => clamp((previous ?? topHeightVars.base) + delta));
    };
    if (e.key === 'ArrowUp') {
      adjust(2, (value) => Math.min(value, 100 - (minBottom / height) * 100));
    }
    if (e.key === 'ArrowDown') {
      adjust(-2, (value) => Math.max(value, (minTop / height) * 100));
    }
  };

  const containerHeight = metrics.height;
  const minPercent = containerHeight ? (minTop / containerHeight) * 100 : 0;
  const maxPercent = containerHeight ? 100 - (minBottom / containerHeight) * 100 : 100;
  const clampedMinPercent = Math.max(0, Math.min(minPercent, 100));
  const clampedMaxPercent = Math.max(clampedMinPercent, Math.min(maxPercent, 100));

  return (
    <div
      ref={containerRef}
      className="splitter-panes flex flex-1 flex-col bg-transparent min-h-0 h-full"
      style={
        {
          '--splitter-top-base': `${topHeightVars.base}%`,
          '--splitter-top-desktop': `${topHeightVars.desktop}%`,
          // 操作後はこの inline 値が CSS のメディアクエリを上書きする
          ...(adjustedTopHeight === null ? {} : { '--splitter-top-h': `${adjustedTopHeight}%` }),
        } as CSSProperties
      }
    >
      {/* 上側エリア */}
      <div
        className="overflow-y-auto px-[var(--page-gap)] pb-[var(--page-gap)]"
        style={{
          height: 'var(--splitter-top-h)',
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onKeyDown={onBarKeyDown}
        // 指でドラッグしてもページがスクロールしないようにする
        style={{ touchAction: 'none' }}
        className="bleed-x cursor-row-resize outline-none"
      >
        <hr className="border-0 border-t-4 border-b border-t-ie-gray border-b-white w-full" />
      </div>
      {/* 下側エリア */}
      <div
        className="overflow-y-auto min-h-0"
        style={{
          height: 'calc(100% - var(--splitter-top-h))',
          minHeight: minBottom,
        }}
      >
        {bottom}
      </div>
    </div>
  );
}
