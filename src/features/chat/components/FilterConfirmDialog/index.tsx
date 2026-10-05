import { useId } from 'react';
import Button from '@shared/components/Button';
import ModalShell from '../shared/ModalShell';

type Props = {
  /** フィルタする伏せ字の IP */
  ip: string;
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
 *
 * - ポインタでは透明な switch が「フィルタする」を受け持つ（ハプティック）。キーボードではボタン自体を押す
 *   （switch はタブ順と支援技術から外す）
 * - 開いたときは「やめる」にフォーカスする（うっかり確定しないように）。Esc と背景のクリックでやめる（ModalShell）
 */
export default function FilterConfirmDialog({ ip, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalShell
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descriptionId}
      onCancel={onCancel}
      className="max-w-sm"
    >
      <p id={titleId} className="font-bold">
        {ip} の発言をフィルタ（非表示に）しますか？
      </p>
      <p id={descriptionId} className="mt-1">
        同じ IP の発言がすべて隠れます。「フィルタ」から解除できます。
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <span className="relative inline-block">
          <Button type="button" onClick={onConfirm}>
            フィルタする
          </Button>
          <input
            type="checkbox"
            {...SWITCH_ATTRIBUTE}
            aria-hidden="true"
            tabIndex={-1}
            onChange={onConfirm}
            data-testid="filter-confirm-haptic-switch"
            className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
        <Button type="button" onClick={onCancel} autoFocus>
          やめる
        </Button>
      </div>
    </ModalShell>
  );
}
