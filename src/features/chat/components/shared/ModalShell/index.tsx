import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  role?: 'dialog' | 'alertdialog';
  /** 見出しの id（aria-labelledby） */
  labelledBy: string;
  /** 説明の id（aria-describedby） */
  describedBy?: string;
  /** Esc と背景のクリックで呼ぶ */
  onCancel: () => void;
  /** 窓の幅などを足す */
  className?: string;
  children: ReactNode;
};

/** 窓の中でフォーカスできる要素（Tab で回す対象） */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 旧来風の小さなモーダルの外枠（.kiro/specs/chat-ip-mute の確認の窓とフィルタの一覧で共有する）。
 * 画面全体を覆う半透明の背景の中央に、Button と同じ outset の枠の窓を出す（R2.2・R2.4）。
 *
 * - document.body の直下に出し（ポータル）、開いている間はそれ以外の body の子に inert を付ける。背後の
 *   リンクやボタンは操作もフォーカスもできなくなる（aria-modal を付けるだけでは Tab で背後へ出られた）
 * - Tab / Shift+Tab は窓の中で回す。Esc は document で受ける（フォーカスが窓の外にあっても閉じる）
 * - 閉じたら、開く前にフォーカスしていた要素へ戻す。その要素が消えていたら（フィルタで行が消えたときなど）戻さない
 * - 最初のフォーカスは中身の autoFocus に任せる
 * - 背景のクリックで閉じるのは、背景の上で押し始めたときだけ。窓を開いた操作の続き（タッチの互換用の click など）が
 *   背景に届いても閉じない
 */
export default function ModalShell({
  role = 'dialog',
  labelledBy,
  describedBy,
  onCancel,
  className = '',
  children,
}: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  // 背景の上で押し始めたか。窓を開いた操作のクリックは、押し始めが窓の外（発言の行）なので閉じない
  const pressedOnBackdropRef = useRef(false);
  // 開く前にフォーカスしていた要素。中身の autoFocus は Effect より先に効くので、最初の描画で覚えておく
  const [returnFocusTo] = useState(() =>
    typeof document === 'undefined' ? null : document.activeElement
  );

  const onDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...(windowRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    const inside = windowRef.current?.contains(active) ?? false;
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    const backdrop = backdropRef.current;
    // 窓の外（アプリ本体など）を操作できなくする。もともと inert だったものはそのままにする
    const madeInert = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element !== backdrop && element instanceof HTMLElement && !element.inert
    );
    for (const element of madeInert) element.inert = true;
    const listener = (event: KeyboardEvent) => onDocumentKeyDown(event);
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      for (const element of madeInert) element.inert = false;
      // StrictMode の開発時の仮のアンマウントでは、窓はまだ DOM にある。そのときは戻さない
      // （戻すと autoFocus で窓に当てたフォーカスが外へ出る）
      if (backdrop?.isConnected) return;
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
        returnFocusTo.focus();
      }
    };
  }, [returnFocusTo]);

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-[var(--page-gap)]"
      onPointerDown={(event) => {
        pressedOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const pressedOnBackdrop = pressedOnBackdropRef.current;
        pressedOnBackdropRef.current = false;
        if (pressedOnBackdrop && event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={windowRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`border-2 border-ie-gray [border-style:outset] bg-ie-bg p-3 font-yui text-sm text-[#222] ${className}`.trim()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
