const SRC = 'https://platform.twitter.com/widgets.js';
let pending: Promise<void> | null = null;
let failed = false;
/** scriptのpendingを共有。失敗後は利用者がretryした時だけ読み直す。 */
export function loadTwitterWidgets(retry = false): Promise<void> {
  if (window.twttr?.widgets) return Promise.resolve();
  if (pending) return pending;
  if (failed && !retry) return Promise.reject(new Error('widgets unavailable'));
  if (retry && failed) document.getElementById('twitter-wjs')?.remove();
  failed = false;
  pending = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('twitter-wjs');
    const script =
      existing instanceof HTMLScriptElement ? existing : document.createElement('script');
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', errored);
    };
    const errored = () => {
      cleanup();
      failed = true;
      pending = null;
      reject(new Error('widgets unavailable'));
    };
    const loaded = () => {
      if (!window.twttr?.widgets) {
        errored();
        return;
      }
      cleanup();
      pending = null;
      resolve();
    };
    const timer = setTimeout(errored, 15_000);
    script.addEventListener('load', loaded);
    script.addEventListener('error', errored);
    if (!existing) {
      script.id = 'twitter-wjs';
      script.src = SRC;
      script.async = true;
      script.charset = 'utf-8';
      document.body.appendChild(script);
    }
  });
  return pending;
}
