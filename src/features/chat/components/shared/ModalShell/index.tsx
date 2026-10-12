import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import LegacyModalShell from './LegacyModalShell';
import {
  hasNativeDialog,
  restoreDialogFocus,
  takeDialogInvoker,
  takeDialogOrigin,
} from '@shared/utils/dialogControl';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

type Props = {
  role?: 'dialog' | 'alertdialog';
  labelledBy: string;
  describedBy?: string;
  onCancel: () => void;
  className?: string;
  children: ReactNode;
  open?: boolean;
  request?: number;
  dialogId?: string;
  onOpen?: () => void;
  onClosed?: () => void;
};
const subscribe = () => () => {};
const serverSnapshot = () => true;

/** The native path owns no body inert, document key listener, or custom focus trap. */
export default function ModalShell({
  role = 'dialog',
  labelledBy,
  describedBy,
  onCancel,
  className = '',
  children,
  open,
  request = 1,
  dialogId,
  onOpen,
  onClosed,
}: Props) {
  const fallbackId = useId();
  const id = dialogId ?? fallbackId;
  const native = useSyncExternalStore(subscribe, hasNativeDialog, serverSnapshot);
  const nodeRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const returnTo = useRef<Element | null>(null);
  const pressedOutside = useRef(false);
  const closeRequests = useRef(0);
  const initialized = useRef(false);
  const notified = useRef(false);
  const [legacyOpen, setLegacyOpen] = useState(open ?? request > 0);
  useResetOnChange(`${native}:${String(open)}:${request}`, () => {
    if (!native) setLegacyOpen(open ?? request > 0);
  });
  const notifyOpen = () => {
    if (notified.current) return;
    notified.current = true;
    onOpen?.();
  };
  const notifyClosed = () => {
    notified.current = false;
    onClosed?.();
  };
  const effectOpened = useEffectEvent(() => notifyOpen());
  const effectClosed = useEffectEvent(() => notifyClosed());
  const effectCancelled = useEffectEvent(() => onCancel());
  const cancel = () => {
    if (!native) {
      setLegacyOpen(false);
      onCancel();
      return;
    }
    const node = nodeRef.current;
    if (!node?.open) return;
    closeRequests.current++;
    onCancel();
    node.close();
  };
  useEffect(() => {
    if (!native) return;
    const node = nodeRef.current;
    if (!node) return;
    if (!initialized.current) {
      initialized.current = true;
      if (open === undefined && node.open) {
        returnTo.current =
          takeDialogInvoker(id) ??
          [...document.querySelectorAll<HTMLButtonElement>('button[commandfor]')].find(
            (button) => button.getAttribute('commandfor') === id
          ) ??
          null;
        effectOpened();
        return;
      }
    }
    const shouldOpen = open ?? request > 0;
    if (shouldOpen && !node.open) {
      const origin = takeDialogOrigin(id);
      previousFocus.current = origin?.previous ?? document.activeElement;
      returnTo.current = origin?.element ?? document.activeElement;
      node.showModal();
      node
        .querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?.focus({ preventScroll: true });
      effectOpened();
    } else if (!shouldOpen && node.open) {
      closeRequests.current++;
      node.close();
    }
  }, [native, open, request, id]);
  useEffect(() => {
    if (native || !legacyOpen) return;
    returnTo.current = takeDialogInvoker(id) ?? document.activeElement;
    effectOpened();
    const listener = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) {
        setLegacyOpen(false);
        effectCancelled();
      }
    };
    document.addEventListener('yui-dialog-close', listener);
    return () => {
      document.removeEventListener('yui-dialog-close', listener);
      effectClosed();
    };
  }, [native, legacyOpen, id]);
  useEffect(
    () => () => {
      takeDialogInvoker(id);
      const node = nodeRef.current;
      queueMicrotask(() => {
        if (node?.open && (!node.isConnected || node.checkVisibility?.() === false)) node.close();
      });
    },
    [id]
  );
  if (!native)
    return legacyOpen ? (
      <LegacyModalShell
        role={role}
        labelledBy={labelledBy}
        describedBy={describedBy}
        onCancel={cancel}
        className={className}
        id={id}
      >
        {children}
      </LegacyModalShell>
    ) : null;
  const content = (
    <dialog
      ref={nodeRef}
      id={id}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`native-modal border-2 border-ie-gray [border-style:outset] bg-ie-bg p-3 font-yui text-sm text-[#222] ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClose={() => {
        const requested = closeRequests.current > 0;
        if (requested) closeRequests.current--;
        if (nodeRef.current?.open) return;
        if (!requested && open === true) onCancel();
        notifyClosed();
        const active = document.activeElement;
        if (
          active === document.body ||
          active === returnTo.current ||
          active === previousFocus.current ||
          nodeRef.current?.contains(active)
        )
          restoreDialogFocus(returnTo.current);
      }}
      onToggle={() => {
        if (nodeRef.current?.open) {
          const origin = takeDialogOrigin(id);
          if (origin) {
            returnTo.current = origin.element;
            previousFocus.current = origin.previous;
          }
          notifyOpen();
        }
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
        if (outside && event.target === event.currentTarget) cancel();
      }}
    >
      {children}
    </dialog>
  );
  return content;
}
