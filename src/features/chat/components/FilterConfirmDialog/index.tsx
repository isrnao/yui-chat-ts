import { useId } from 'react';
import type { ReactNode } from 'react';
import Button from '@shared/components/Button';
import ModalShell from '../shared/ModalShell';

type Props = {
  /** 見出し（例:「219.*.*.253 の発言をフィルタ（非表示に）しますか？」） */
  title: string;
  /** 見出しの下の説明 */
  description: string;
  /** 説明の下に出す中身（言葉のフィルタで言葉を選ぶ欄） */
  children?: ReactNode;
  /** 「フィルタする」を押せないとき（言葉が空のときなど） */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * iOS Safari（18 以降）は、利用者が `<input type="checkbox" switch>` を指で切り替えたときに本物のハプティックを鳴らす。
 * navigator.vibrate がない iOS でも振動させるため、「フィルタする」ボタンの上に透明な switch を重ね、指で直接押させる。
 * スクリプトからの click() では鳴らないので、重ねる必要がある。switch に対応しないブラウザでは普通の checkbox になり、
 * 押せばそのまま確定する（振動は onConfirm の中の navigator.vibrate に任せる）。
 * React の型は switch 属性を知らないので、スプレッドで渡す
 */
const SWITCH_ATTRIBUTE = { switch: '' };

/**
 * フィルタの確認（.kiro/specs/chat-ip-mute Requirement 2）。window.confirm の代わりに出す旧来風の小さな窓。
 * IP・名前・言葉のフィルタで共有する。
 *
 * - ポインタでは透明な switch が「フィルタする」を受け持つ（ハプティック）。キーボードではボタン自体を押す
 *   （switch はタブ順と支援技術から外す）
 * - 開いたときは「やめる」にフォーカスする（うっかり確定しないように）。Esc と背景のクリックでやめる（ModalShell）
 */
export default function FilterConfirmDialog({
  title,
  description,
  children,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalShell
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descriptionId}
      onCancel={onCancel}
      className="w-full max-w-sm"
    >
      <p id={titleId} className="font-bold">
        {title}
      </p>
      <p id={descriptionId} className="mt-1">
        {description}
      </p>
      {children}
      <div className="mt-3 flex justify-end gap-2">
        <span className="relative inline-block">
          <Button type="button" onClick={onConfirm} disabled={confirmDisabled}>
            フィルタする
          </Button>
          <input
            type="checkbox"
            {...SWITCH_ATTRIBUTE}
            aria-hidden="true"
            tabIndex={-1}
            disabled={confirmDisabled}
            onChange={onConfirm}
            data-testid="filter-confirm-haptic-switch"
            className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <Button type="button" onClick={onCancel} autoFocus>
          やめる
        </Button>
      </div>
    </ModalShell>
  );
}
