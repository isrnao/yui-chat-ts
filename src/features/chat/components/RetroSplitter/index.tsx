import { useRef, useState, useCallback, useEffect, isValidElement } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';

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
  const [topHeight, setTopHeight] = useState(30); // percent
  const [dragging, setDragging] = useState(false);

  // パーセント計算ロジック分離
  const calcPercent = useCallback(
    (clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return topHeight;
      let percent = ((clientY - rect.top) / rect.height) * 100;
      percent = Math.max((minTop / rect.height) * 100, percent);
      percent = Math.min(100 - (minBottom / rect.height) * 100, percent);
      return percent;
    },
    [minTop, minBottom, topHeight]
  );

  // ドラッグ中マウスmove
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      setTopHeight(calcPercent(e.clientY));
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

  // top, bottomの切り替えで高さ初期化
  useEffect(() => {
    if (top && bottom && isValidElement(top) && typeof top.type === 'function') {
      setTopHeight(top.type.name === 'ChatRoom' ? 18 : 26);
    }
  }, [top, bottom]);

  // キーボード操作でもドラッグできるように
  const onBarKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp')
      setTopHeight((h) =>
        Math.min(
          h + 2,
          100 - (minBottom / (containerRef.current?.getBoundingClientRect().height ?? 1)) * 100
        )
      );
    if (e.key === 'ArrowDown')
      setTopHeight((h) =>
        Math.max(
          h - 2,
          (minTop / (containerRef.current?.getBoundingClientRect().height ?? 1)) * 100
        )
      );
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-transparent select-none min-h-screen h-screen"
      style={{ height: '100vh' }}
    >
      {/* 上側エリア */}
      <div style={{ height: `${topHeight}%`, minHeight: minTop, overflow: 'auto' }}>{top}</div>
      {/* 分割バー */}
      <div
        role="separator"
        aria-label="上下の領域を分割するバー"
        tabIndex={0}
        onMouseDown={() => setDragging(true)}
        onKeyDown={onBarKeyDown}
        style={{
          outline: 'none',
        }}
      >
        <hr className="border-0 border-t-4 border-b border-t-[var(--ie-gray)] border-b-white w-full" />
      </div>
      {/* 下側エリア */}
      <div
        style={{
          height: `${100 - topHeight}%`,
          minHeight: minBottom,
          overflow: 'auto',
        }}
      >
        {bottom}
      </div>
    </div>
  );
}
