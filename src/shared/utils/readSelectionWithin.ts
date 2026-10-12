/** A selection belongs to one source only when both endpoints and every range stay inside it. */
export function readSelectionWithin(element: Element, selection: Selection | null): string {
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode)
    return '';
  if (!element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return '';
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return '';
  }
  return selection.toString().trim();
}
