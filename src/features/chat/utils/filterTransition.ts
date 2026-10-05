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

/** 行が上下に縮んで消えるまでの時間（ms） */
export const COLLAPSE_MS = 200;

/** 縮める CSS プロパティ。box-sizing は Tailwind の preflight で border-box */
const COLLAPSED = {
  height: '0px',
  marginTop: '0px',
  marginBottom: '0px',
  paddingTop: '0px',
  paddingBottom: '0px',
  borderTopWidth: '0px',
  borderBottomWidth: '0px',
  opacity: '0',
};

function collapseKeyframes(element: HTMLElement): Keyframe[] {
  const style = getComputedStyle(element);
  return [
    {
      height: `${element.getBoundingClientRect().height}px`,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      borderTopWidth: style.borderTopWidth,
      borderBottomWidth: style.borderBottomWidth,
      opacity: '1',
    },
    COLLAPSED,
  ];
}

/**
 * フィルタする行を上下に縮めて消し、縮み終わってから done を呼ぶ（.kiro/specs/chat-ip-mute Requirement 7.1）。
 *
 * View Transition で行の「画像」を縮めると、下の行は先に詰まり、縮んでいる間は画像と重なって見える。
 * ここでは行そのものの高さを Web Animations で 0 にするので、下の行も一緒にせり上がる。
 * 行のすぐ下の区切り線（<hr>）も一緒に縮める。アニメーションできない環境（Web Animations がない・動きを減らす設定）
 * では、その場で done を呼ぶ
 */
export function collapseRowThen(row: HTMLElement | null, done: () => void): void {
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!row || typeof row.animate !== 'function' || reduceMotion) {
    done();
    return;
  }

  const divider = row.nextElementSibling instanceof HTMLHRElement ? row.nextElementSibling : null;
  const animations = [row, divider]
    .filter((element): element is HTMLElement => element !== null)
    .map((element) => {
      const keyframes = collapseKeyframes(element);
      element.style.overflow = 'hidden';
      return element.animate(keyframes, {
        duration: COLLAPSE_MS,
        easing: 'ease-in',
        fill: 'forwards',
      });
    });
  // 途中で行がなくなった（ログの取り直しなど）ときに cancel されても、フィルタは反映する
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(done);
}
