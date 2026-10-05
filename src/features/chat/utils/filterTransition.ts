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
export function runFilterTransition(update: () => void, prepare?: () => () => void): void {
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    update();
    return;
  }

  const root = document.documentElement;
  root.setAttribute(FILTER_TRANSITION_ATTR, '');
  // 古い状態を撮る前に名前を付け（nameRowsInView）、終わったら外す
  const unprepare = prepare?.();
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  // 省かれたときに ready は reject される。未処理の reject として報告させない
  transition.ready.catch(() => {});
  const cleanup = () => {
    root.removeAttribute(FILTER_TRANSITION_ATTR);
    unprepare?.();
  };
  transition.finished.then(cleanup, cleanup);
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
  const limit = window.innerHeight * 2;
  const named: HTMLElement[] = [];
  const name = (element: HTMLElement, value: string) => {
    element.style.viewTransitionName = value;
    named.push(element);
  };

  for (const row of container.querySelectorAll<HTMLElement>(`[${ROW_UUID_ATTR}]`)) {
    const rect = row.getBoundingClientRect();
    if (rect.top > limit) break;
    if (rect.bottom < 0) continue;
    const id = toIdent(row.getAttribute(ROW_UUID_ATTR) ?? '');
    name(row, `filter-row-${id}`);
    const divider = row.nextElementSibling;
    if (divider instanceof HTMLHRElement) name(divider, `filter-hr-${id}`);
  }

  return () => {
    for (const element of named) element.style.viewTransitionName = '';
  };
}
