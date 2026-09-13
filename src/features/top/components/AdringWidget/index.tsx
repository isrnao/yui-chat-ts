import { useEffect, useRef } from 'react';
import { useInViewport } from '@shared/hooks/useInViewport';

const ADRING_WIDGET_SRC = 'https://ar-cdn.net/widget/v1.js';

/** バナーの想定高さ (px)。領域の先行確保に使う */
const BANNER_MIN_HEIGHT = { compact: 100, default: 250 } as const;

export type AdringWidgetProps = {
  /** Adring 管理画面で発行されるサイト ID (UUID) */
  siteId: string;
  /** バナーの表示バリエーション */
  variant?: 'compact' | 'default';
  className?: string;
};

/**
 * Adring (個人サイト向け広告バナー) の埋め込み。
 *
 * widget script は挿入された位置にバナーを描画するため、
 * `document.body` ではなく専用コンテナへ script を append する。
 * StrictMode の二重マウントやルート遷移での再マウントでバナーが
 * 重複しないよう、クリーンアップでコンテナごと空にする。
 */
export function AdringWidget({ siteId, variant = 'compact', className }: AdringWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // バナーは画面下部にあるので、見えるまで widget script を読まない
  const isVisible = useInViewport(containerRef);

  useEffect(() => {
    if (!isVisible) return;
    const container = containerRef.current;
    if (!container) return;

    const script = document.createElement('script');
    script.src = ADRING_WIDGET_SRC;
    script.async = true;
    script.dataset.siteId = siteId;
    script.dataset.variant = variant;
    container.append(script);

    return () => container.replaceChildren();
  }, [isVisible, siteId, variant]);

  // 読み込みを遅延しているぶん、バナー挿入時にレイアウトが動かないよう
  // 先に高さを確保する
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: BANNER_MIN_HEIGHT[variant] }}
    />
  );
}
