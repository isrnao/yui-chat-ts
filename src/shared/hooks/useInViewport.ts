import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * 要素がビューポート（付近）に入ったかどうか。一度入ったら true のまま。
 *
 * サードパーティ script を初期描画の critical path から外すために使う。
 * 実測ではトップページの転送量 574KB のうち 303KB がサードパーティで、
 * 自前の資産より大きく Render Delay の主因になっていた。
 *
 * IntersectionObserver が無い環境（jsdom / 古いブラウザ）では遅延せず true を返す。
 * サーバー描画でも true になるが、この値はマークアップに出ないので
 * hydration の不一致は起こさない。
 */
export function useInViewport(ref: RefObject<Element | null>, rootMargin = '200px'): boolean {
  const [inViewport, setInViewport] = useState(() => typeof IntersectionObserver !== 'function');

  useEffect(() => {
    if (inViewport) return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setInViewport(true);
      },
      { rootMargin }
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [inViewport, ref, rootMargin]);

  return inViewport;
}
