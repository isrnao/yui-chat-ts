const invokers = new Map<string, { element: HTMLElement; previous: Element | null }>();
export function rememberDialogInvoker(id: string, element: HTMLElement): void {
  invokers.set(id, { element, previous: document.activeElement });
}
export function takeDialogOrigin(
  id: string
): { element: HTMLElement; previous: Element | null } | null {
  const origin = invokers.get(id) ?? null;
  invokers.delete(id);
  return origin;
}
export function takeDialogInvoker(id: string): HTMLElement | null {
  return takeDialogOrigin(id)?.element ?? null;
}
export function hasInvokerCommands(): boolean {
  return (
    hasNativeDialog() &&
    typeof HTMLButtonElement !== 'undefined' &&
    'commandForElement' in HTMLButtonElement.prototype
  );
}
export function hasNativeDialog(): boolean {
  return (
    typeof HTMLDialogElement !== 'undefined' &&
    typeof HTMLDialogElement.prototype.showModal === 'function'
  );
}
export function restoreDialogFocus(element: Element | null): void {
  if (document.querySelector('dialog[open], [data-legacy-modal-root]')) return;
  const fallback = document.querySelector<HTMLElement>('[data-chat-log-root]');
  const target = element instanceof HTMLElement && element.isConnected ? element : fallback;
  target?.focus({ preventScroll: true });
}
export function closeDialog(id: string): void {
  const element = document.getElementById(id);
  if (
    typeof HTMLDialogElement !== 'undefined' &&
    element instanceof HTMLDialogElement &&
    typeof element.close === 'function'
  )
    element.close();
  else document.dispatchEvent(new CustomEvent('yui-dialog-close', { detail: id }));
}

/** cancelとして扱う閉じる要求。必須入力のvalidityと独立して実行する。 */
export function requestDialogClose(id: string): void {
  const element = document.getElementById(id);
  if (
    typeof HTMLDialogElement !== 'undefined' &&
    element instanceof HTMLDialogElement &&
    element.open
  ) {
    if (typeof element.requestClose === 'function') element.requestClose();
    else {
      const event = new Event('cancel', { cancelable: true });
      if (element.dispatchEvent(event)) element.close();
    }
  } else {
    document.dispatchEvent(new CustomEvent('yui-dialog-close', { detail: id }));
  }
}
