import { useEffect, useRef } from 'react';
import { useInViewport } from '@shared/hooks/useInViewport';

const TWITTER_WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';

/** 埋め込み iframe の高さ。領域の先行確保にも使う */
const TIMELINE_HEIGHT = 500;

declare global {
  interface Window {
    twttr?: {
      widgets: { load: (element?: HTMLElement | null) => void };
    };
  }
}

/**
 * 公式 widgets.js による Twitter / X タイムライン埋め込み。
 *
 * widgets.js は `.twitter-timeline` 要素を iframe に置換する。
 * SPA 内で複数回マウントされても script を重複ロードしないよう、
 * `id="twitter-wjs"` (X 公式 snippet 互換) で既存タグを検出し、
 * 既にあれば `twttr.widgets.load()` で再スキャンする。
 *
 * 親要素の高さ不足で iframe が 0px のまま見えなくなる事故を防ぐため、
 * `data-height` を指定する。
 */
export function TwitterTimeline({ screenName }: { screenName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 埋め込みは画面下部にあるので、見えるまで widgets.js を読まない。
  // 実測で widgets.js + iframe が約 131KB あり、初期描画の帯域を奪っていた。
  const isVisible = useInViewport(containerRef);

  useEffect(() => {
    if (!isVisible) return;

    const loadWidgets = () => {
      window.twttr?.widgets.load(containerRef.current);
    };

    const existingScript = document.getElementById('twitter-wjs');
    if (existingScript) {
      loadWidgets();
      return;
    }

    const script = document.createElement('script');
    script.id = 'twitter-wjs';
    script.src = TWITTER_WIDGETS_SRC;
    script.async = true;
    script.charset = 'utf-8';
    script.onload = loadWidgets;
    document.body.appendChild(script);
  }, [isVisible, screenName]);

  // screenName は呼び出し元でハードコードする想定 (XSS 経路を断つため英数字 + _ のみ許可)
  const safeScreenName = screenName.replace(/[^a-zA-Z0-9_]/g, '');

  return (
    // 読み込みを遅延しているぶん、差し替え時にレイアウトが動かないよう
    // iframe と同じ高さ (data-height) を先に確保する
    <div ref={containerRef} className="p-2" style={{ minHeight: TIMELINE_HEIGHT + 16 }}>
      <a
        className="twitter-timeline"
        data-height={TIMELINE_HEIGHT}
        data-lang="ja"
        href={`https://twitter.com/${safeScreenName}?ref_src=twsrc%5Etfw`}
      >
        Tweets by {safeScreenName}
      </a>
    </div>
  );
}
