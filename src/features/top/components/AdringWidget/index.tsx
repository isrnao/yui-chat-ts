import { useEffect, useRef } from 'react';

const ADRING_WIDGET_SRC = 'https://ar-cdn.net/widget/v1.js';

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const script = document.createElement('script');
    script.src = ADRING_WIDGET_SRC;
    script.async = true;
    script.dataset.siteId = siteId;
    script.dataset.variant = variant;
    container.append(script);

    return () => container.replaceChildren();
  }, [siteId, variant]);

  return <div ref={containerRef} className={className} />;
}
