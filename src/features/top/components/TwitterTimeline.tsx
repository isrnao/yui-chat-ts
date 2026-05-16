import { useEffect, useRef } from 'react';

const TWITTER_WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';

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

  useEffect(() => {
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
  }, [screenName]);

  // screenName は呼び出し元でハードコードする想定 (XSS 経路を断つため英数字 + _ のみ許可)
  const safeScreenName = screenName.replace(/[^a-zA-Z0-9_]/g, '');

  return (
    <div ref={containerRef} className="p-2">
      <a
        className="twitter-timeline"
        data-height="500"
        data-lang="ja"
        href={`https://twitter.com/${safeScreenName}?ref_src=twsrc%5Etfw`}
      >
        Tweets by {safeScreenName}
      </a>
    </div>
  );
}
