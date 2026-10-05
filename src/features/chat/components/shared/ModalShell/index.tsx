import type { KeyboardEvent, ReactNode } from 'react';

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

/**
 * 旧来風の小さなモーダルの外枠（.kiro/specs/chat-ip-mute の確認の窓とフィルタの一覧で共有する）。
 * 画面全体を覆う半透明の背景の中央に、Button と同じ outset の枠の窓を出す。Esc（窓の上の keydown）と
 * 背景のクリックで onCancel を呼ぶ。最初のフォーカスは中身の autoFocus に任せる
 */
export default function ModalShell({
  role = 'dialog',
  labelledBy,
  describedBy,
  onCancel,
  className = '',
  children,
}: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-[var(--page-gap)]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`border-2 border-ie-gray [border-style:outset] bg-ie-bg p-3 font-yui text-sm text-[#222] ${className}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
