const invokers = new Map<string, HTMLElement>();
export function rememberDialogInvoker(id: string, element: HTMLElement): void {
  invokers.set(id, element);
}
export function takeDialogInvoker(id: string): HTMLElement | null {
  const element = invokers.get(id) ?? null;
  invokers.delete(id);
  return element;
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
  if (element instanceof HTMLDialogElement && typeof element.close === 'function') element.close();
  else document.dispatchEvent(new CustomEvent('yui-dialog-close', { detail: id }));
}
