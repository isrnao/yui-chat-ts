import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type Props = {
  /** 開いているか。開閉はこの値だけで決まる */
  open: boolean;
  role?: 'dialog' | 'alertdialog';
  /** 見出しの id（aria-labelledby） */
  labelledBy: string;
  /** 説明の id（aria-describedby） */
  describedBy?: string;
  /** Esc・背景のクリックで呼ぶ。呼び出し側が open を false にする */
  onCancel: () => void;
  /**
   * 閉じた後にフォーカスを戻す先。渡さなければ、開いたときにフォーカスしていた要素へ戻す。
   * ダブルタップで開く窓は、開いた操作がフォーカスを動かさないので、ログ領域などを渡す
   */
  returnFocus?: () => HTMLElement | null;
  /** 窓の幅などを足す */
  className?: string;
  children: ReactNode;
};

/** フォーカスを戻す先が見つからないときの行き先（ChatLogList の外枠） */
const LOG_ROOT = '[data-chat-log-root]';

/**
 * 旧来風の小さなモーダルの外枠（確認・通報・フィルタの一覧で共有する）。ネイティブの `<dialog>` を
 * showModal() で開くので、背後の inert・Tab の閉じ込め・Esc はブラウザが受け持つ。
 *
 * - 開閉は `open` だけで決める。Esc と背景のクリックは onCancel で呼び出し側へ知らせる
 * - 最初のフォーカスは `data-dialog-initial-focus` の要素（安全な取消ボタン）
 * - 閉じたら returnFocus の先、なければ開いたときにフォーカスしていた要素へ戻す。どちらも消えていればログ領域
 * - 背景のクリックで閉じるのは、背景の上で押し始めたときだけ。窓を開いた操作の続き（タッチの互換用の
 *   click など）が背景に届いても閉じない
 */
export default function ModalShell({
  open,
  role = 'dialog',
  labelledBy,
  describedBy,
  onCancel,
  returnFocus,
  className = '',
  children,
}: Props) {
  const nodeRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const pressedOutside = useRef(false);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !open) return;
    if (!node.open) {
      opener.current = document.activeElement;
      node.showModal();
      node
        .querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?.focus({ preventScroll: true });
    }
    // open が false になった・Activity で隠れた・外れたときに top layer から出す
    return () => {
      if (node.open) node.close();
    };
  }, [open]);

  const restoreFocus = () => {
    // 通報の窓へ続けて開いたときは、そちらのフォーカスを奪わない
    if (document.querySelector('dialog[open]')) return;
    const active = document.activeElement;
    const preferred = returnFocus?.() ?? null;
    // ブラウザが開く前の要素へ戻していれば、それに任せる
    if (!preferred && active && active !== document.body && !nodeRef.current?.contains(active))
      return;
    const target = [preferred, opener.current, document.querySelector(LOG_ROOT)].find(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.isConnected && element !== document.body
    );
    target?.focus({ preventScroll: true });
  };

  return (
    <dialog
      ref={nodeRef}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`native-modal border-2 border-ie-gray [border-style:outset] bg-ie-bg p-3 font-yui text-sm text-[#222] ${className}`}
      onCancel={(event) => {
        // 閉じるかどうかは open で決める
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        // ブラウザが自分で閉じた（繰り返しの Esc など）なら、呼び出し側の open も戻す
        if (open) onCancel();
        restoreFocus();
      }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pressedOutside.current =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
      }}
      onClick={(event) => {
        const outside = pressedOutside.current;
        pressedOutside.current = false;
        if (outside && event.target === event.currentTarget) onCancel();
      }}
    >
      {children}
    </dialog>
  );
}
