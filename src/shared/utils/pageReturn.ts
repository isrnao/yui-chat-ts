/**
 * ページへ戻ったことの通知。タブの切替・アプリの切替・BFCache からの復帰を 1 か所で数える。
 *
 * - hiddenMs: 隠れていた時間。表示していた時間ではないので、長く開いていても短いタブ切替では小さい
 * - persisted: BFCache から戻った（pageshow の persisted）
 *
 * BFCache から戻るときは pageshow と visibilitychange が続けて届く。購読者が取得を 2 回始めないよう、
 * 短い間に届いたものを 1 回の通知にまとめる。
 */
export type PageReturn = { hiddenMs: number; persisted: boolean };
type Listener = (info: PageReturn) => void;

const COALESCE_MS = 50;
const listeners = new Set<Listener>();
let hiddenAt: number | null = null;
let pending: PageReturn | null = null;

const flush = () => {
  const info = pending;
  pending = null;
  if (info) for (const listener of listeners) listener(info);
};

const record = (persisted: boolean) => {
  if (pending) {
    pending.persisted ||= persisted;
    return;
  }
  pending = { hiddenMs: hiddenAt === null ? 0 : Date.now() - hiddenAt, persisted };
  hiddenAt = null;
  setTimeout(flush, COALESCE_MS);
};

const onVisibility = () => {
  if (document.visibilityState === 'hidden') {
    if (hiddenAt === null) hiddenAt = Date.now();
  } else if (hiddenAt !== null) {
    record(false);
  }
};

const onPageShow = (event: PageTransitionEvent) => {
  if (event.persisted) record(true);
};

export function subscribePageReturn(listener: Listener): () => void {
  if (listeners.size === 0) {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    hiddenAt = null;
    pending = null;
  };
}
