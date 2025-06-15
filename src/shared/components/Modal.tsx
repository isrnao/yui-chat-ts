import { useEffect, useRef } from 'react';

type ModalProps = {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
};

export default function Modal({
  open,
  onClose,
  children,
  className = '',
  ariaLabel = 'モーダルダイアログ',
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // エスケープキーで閉じる
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // オーバーレイクリックで閉じる
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose?.();
    }
  };

  // スクロール禁止
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center transition-all"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      aria-label={ariaLabel}
    >
      <div
        className={`relative z-10 bg-white p-6 rounded-xl shadow-xl min-w-[280px] ${className}`}
        tabIndex={-1}
      >
        {children}
        {onClose && (
          <button
            aria-label="閉じる"
            type="button"
            className="absolute top-2 right-2 text-xl text-gray-400 hover:text-gray-600"
            onClick={onClose}
            tabIndex={0}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
