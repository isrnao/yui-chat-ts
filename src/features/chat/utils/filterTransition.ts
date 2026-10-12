import { flushSync } from 'react-dom';

/** View Transition の間だけ <html> に付ける属性。CSS はこれでフィルタの演出だけに絞る */
export const FILTER_TRANSITION_ATTR = 'data-filter-transition';

/**
 * フィルタの追加を View Transition でアニメーションする（.kiro/specs/chat-ip-mute Requirement 7.1）。
 * prepare は古い状態を撮る前に呼び、返した関数は Transition が終わったら呼ぶ（名前を付けて外すため）。
 *
 * フィルタの一覧は外部ストア（useSyncExternalStore）にある。React は外部ストアの更新を startTransition の
 * 中でも同期の更新として扱い、<ViewTransition> は Transition の更新でしか動かないので、ここでは
 * document.startViewTransition を直接呼び、flushSync で更新を DOM に反映させる。
 *
 * - 型（types）ではなく <html> の属性で CSS を絞る。types は Chrome 125 / Safari 18.2 からで、
 *   それより前の対応ブラウザでは引数にオブジェクトを渡すと例外になるため、コールバックの形で呼ぶ
 * - 非対応のブラウザと、動きを減らす設定ではアニメーションなしで更新する（Requirement 7.5）
 * - 同じ名前の要素が 2 つある（2 本の指で別の行を押していた）などで省かれても、更新そのものは行われる
 */
type Running = { cleanup: () => void; transition?: ViewTransition };
let running: Running | null = null;

export function runFilterTransition(update: () => void, prepare?: () => () => void): void {
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    update();
    return;
  }
  running?.transition?.skipTransition?.();
  running?.cleanup();
  const root = document.documentElement;
  const previous = root.getAttribute(FILTER_TRANSITION_ATTR);
  let unprepare = () => {};
  let cleaned = false;
  let applied = false;
  const applyOnce = () => {
    if (!applied) {
      applied = true;
      update();
    }
  };
  const entry: Running = {
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      if (running === entry) {
        if (previous === null) root.removeAttribute(FILTER_TRANSITION_ATTR);
        else root.setAttribute(FILTER_TRANSITION_ATTR, previous);
        running = null;
      }
      unprepare();
    },
  };
  running = entry;
  root.setAttribute(FILTER_TRANSITION_ATTR, '');
  try {
    unprepare = prepare?.() ?? (() => {});
    entry.transition = document.startViewTransition(() => flushSync(applyOnce));
  } catch {
    try {
      applyOnce();
    } finally {
      entry.cleanup();
    }
    return;
  }
  entry.transition.ready.catch(() => {});
  void entry.transition.finished.then(entry.cleanup, entry.cleanup);
}

/** 発言の行に付ける属性。値は発言の uuid（ChatMessage が付ける） */
export const ROW_UUID_ATTR = 'data-chat-uuid';

/** view-transition-name に使えるよう、uuid を CSS の識別子の文字だけにする */
const toIdent = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * 画面内とその下 1 画面ぶんの行と、そのすぐ下の区切り線（<hr>）に一意の View Transition の名前を付け、
 * 名前を外す関数を返す（.kiro/specs/chat-ip-mute Requirement 7.1 / 7.3）。
 *
 * 名前を付けた要素は、ブラウザの既定の動きで、新しい状態にないもの（フィルタした行）はその場でフェードアウトし、
 * 両方にあるもの（残る行）は古い位置から新しい位置へ動く。こうして消える行の下の行が上へ詰まる。
 * 名前のない要素はページ全体（root）の画像に含まれて一気に詰まるので、見えている行には名前が要る。
 * 全行に付けると 1000 行で重いので、見えている範囲（と、下から上がってくる 1 画面ぶん）に限る。
 * 行は新しい順に上から並ぶので、範囲より下に出たところで打ち切る
 */
export function nameRowsInView(container: HTMLElement | null): () => void {
  if (!container) return () => {};
  const viewport = container.closest<HTMLElement>('[data-log-scroll]');
  const bounds = viewport?.getBoundingClientRect();
  const top = bounds?.top ?? 0;
  const limit = (bounds?.bottom ?? window.innerHeight) + (bounds?.height ?? window.innerHeight);
  const named: { element: HTMLElement; previous: string; assigned: string }[] = [];
  const name = (element: HTMLElement, value: string) => {
    named.push({ element, previous: element.style.viewTransitionName, assigned: value });
    element.style.viewTransitionName = value;
  };

  const cleanup = () => {
    for (const { element, previous, assigned } of named) {
      if (element.style.viewTransitionName === assigned)
        element.style.viewTransitionName = previous;
    }
  };
  try {
    for (const row of container.querySelectorAll<HTMLElement>(`[${ROW_UUID_ATTR}]`)) {
      const rect = row.getBoundingClientRect();
      if (rect.top > limit) break;
      if (rect.bottom < top) continue;
      const id = toIdent(row.getAttribute(ROW_UUID_ATTR) ?? '');
      name(row, `filter-row-${id}`);
      const divider = row.nextElementSibling;
      if (divider instanceof HTMLHRElement) name(divider, `filter-hr-${id}`);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}
