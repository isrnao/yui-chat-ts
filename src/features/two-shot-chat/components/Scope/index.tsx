import type { CSSProperties, ReactNode, Ref } from 'react';
import '../../styles/two-shot.css';

/**
 * ツーショットチャットのスコープ。この中だけサイト共通のリセットを打ち消し、原作と同じブラウザ既定の見た目に戻す
 * （styles/two-shot.css）。フレームの画面とページ全体のお知らせの両方がこれを根にする。
 */
export default function TwoShotScope({
  className,
  style,
  ref,
  children,
}: {
  className: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div ref={ref} className={`two-shot-scope ${className}`} style={style}>
      {children}
    </div>
  );
}
