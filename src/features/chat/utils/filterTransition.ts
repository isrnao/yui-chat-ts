import { flushSync } from 'react-dom';

/** View Transition の間だけ <html> に付ける属性。CSS はこれでフィルタの演出だけに絞る */
export const FILTER_TRANSITION_ATTR = 'data-filter-transition';

/**
 * フィルタの追加を View Transition でアニメーションする（.kiro/specs/chat-ip-mute Requirement 7.1）。
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
export function runFilterTransition(update: () => void): void {
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    update();
    return;
  }

  const root = document.documentElement;
  root.setAttribute(FILTER_TRANSITION_ATTR, '');
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  // 省かれたときに ready は reject される。未処理の reject として報告させない
  transition.ready.catch(() => {});
  const cleanup = () => root.removeAttribute(FILTER_TRANSITION_ATTR);
  transition.finished.then(cleanup, cleanup);
}
