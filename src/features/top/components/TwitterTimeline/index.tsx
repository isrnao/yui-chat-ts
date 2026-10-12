import { useEffect, useRef, useState } from 'react';
import { useInViewport } from '@shared/hooks/useInViewport';
import { loadTwitterWidgets } from '../../utils/twitterLoader';
declare global {
  interface Window {
    twttr?: { widgets: { load: (element?: HTMLElement | null) => void } };
  }
}
function initialize(container: HTMLElement): boolean {
  try {
    window.twttr?.widgets.load(container);
    return true;
  } catch {
    return false;
  }
}
export function TwitterTimeline({ screenName }: { screenName: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const vendorRef = useRef<HTMLDivElement>(null);
  const visible = useInViewport(rootRef);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'idle' | 'pending' | 'ready' | 'failed'>('idle');
  const safeName = screenName.replace(/[^a-zA-Z0-9_]/g, '');
  useEffect(() => {
    if (!visible) return;
    const container = vendorRef.current;
    if (!container) return;
    let cancelled = false;
    const anchor = document.createElement('a');
    anchor.className = 'twitter-timeline';
    anchor.dataset.height = '500';
    anchor.dataset.lang = 'ja';
    anchor.href = `https://twitter.com/${safeName}?ref_src=twsrc%5Etfw`;
    anchor.textContent = `Tweets by ${safeName}`;
    container.replaceChildren(anchor);
    loadTwitterWidgets(attempt > 0).then(
      () => {
        if (cancelled || !container.isConnected) return;
        setState(initialize(container) ? 'ready' : 'failed');
      },
      () => {
        if (!cancelled) setState('failed');
      }
    );
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [visible, safeName, attempt]);
  return (
    <div ref={rootRef} className="p-2">
      <div ref={vendorRef} />
      <a
        href={`https://twitter.com/${safeName}?ref_src=twsrc%5Etfw`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Xで{safeName}を見る
      </a>
      {state === 'failed' && (
        <p role="status">
          埋め込みを読み込めませんでした。
          <button
            type="button"
            onClick={() => {
              setState('pending');
              setAttempt((value) => value + 1);
            }}
          >
            再試行
          </button>
        </p>
      )}
    </div>
  );
}
