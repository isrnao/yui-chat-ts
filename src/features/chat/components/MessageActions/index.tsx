import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from 'react';
import { useRetainedValue } from '@shared/hooks/useRetainedValue';
import type { Chat } from '@features/chat/types';
import {
  resolveFilterRequest,
  FILTER_TARGET_ATTR,
  type FilterRequest,
} from '@features/chat/utils/filterRequest';
import { restoreDialogFocus } from '@shared/utils/dialogControl';
export type MessageActionTarget = { chat: Chat; row: HTMLElement; button: HTMLButtonElement };
const subscribe = () => () => {};
const supportsPopover = () =>
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
const serverSnapshot = () => true;
export default function MessageActions({
  id,
  target,
  visible,
  onDismiss,
  onFilter,
  onReport,
}: {
  id: string;
  target: MessageActionTarget | null;
  visible: boolean;
  onDismiss: () => void;
  onFilter: (request: FilterRequest) => void;
  onReport: (uuid: string, button: HTMLButtonElement) => void;
}) {
  const native = useSyncExternalStore(subscribe, supportsPopover, serverSnapshot);
  const display = useRetainedValue(target);
  const node = useRef<HTMLDivElement>(null);
  const dismissEffect = useEffectEvent(() => onDismiss());
  const close = () => {
    if (native && node.current?.matches(':popover-open')) node.current.hidePopover();
    onDismiss();
  };
  useEffect(() => {
    const element = node.current;
    if (!native || !element) return;
    if (target && visible && target.row.isConnected) {
      if (!element.matches(':popover-open')) element.showPopover({ source: target.button });
    } else if (element.matches(':popover-open')) {
      element.hidePopover();
    }
    return () => {
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [native, target, visible]);
  useEffect(() => () => dismissEffect(), []);
  useEffect(() => {
    if (target && !visible) dismissEffect();
  }, [target, visible]);
  useEffect(() => {
    if (native || !target || !visible) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissEffect();
        restoreDialogFocus(target.button);
      }
    };
    const pointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !node.current?.contains(event.target) &&
        !target.button.contains(event.target)
      )
        dismissEffect();
    };
    node.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', pointer);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', pointer);
    };
  }, [native, target, visible]);
  const request = (kind: 'ip' | 'name' | 'word') => {
    if (!display) return null;
    const marked =
      kind === 'ip'
        ? null
        : display.row.querySelector(
            `[${FILTER_TARGET_ATTR}="${kind === 'word' ? 'message' : kind}"]`
          );
    return kind !== 'ip' && !marked
      ? null
      : resolveFilterRequest(display.chat, display.row, marked);
  };
  return (
    <div
      id={id}
      ref={node}
      popover={native ? 'auto' : undefined}
      hidden={native ? undefined : !(target && visible)}
      role="group"
      aria-label="発言への操作"
      className="message-action-panel"
      onToggle={(event) => {
        if (!event.currentTarget.matches(':popover-open')) onDismiss();
      }}
    >
      {display && (
        <>
          {(['name', 'word', 'ip'] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              disabled={!request(kind)}
              onClick={() => {
                const next = request(kind);
                if (!next) return;
                close();
                onFilter(next);
              }}
            >
              {kind === 'name'
                ? '名前をフィルタ'
                : kind === 'word'
                  ? '言葉をフィルタ'
                  : 'IPをフィルタ'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              close();
              onReport(display.chat.uuid, display.button);
            }}
          >
            通報する
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              restoreDialogFocus(display.button);
            }}
          >
            閉じる
          </button>
        </>
      )}
    </div>
  );
}
