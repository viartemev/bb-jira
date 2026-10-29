export const issueDragType = "application/x-bb-jira-issue";

/** Route our native drops through BB's public mention clipboard format.
 * BB's editor understands mention HTML on paste, but its generic drop path
 * otherwise flattens that HTML into text. No draft or editor internals are used.
 */
export function mountIssueDrops() {
  const drop = (event: globalThis.DragEvent) => {
    const transfer = event.dataTransfer;
    if (!transfer?.types.includes(issueDragType)) return;
    const key = transfer.getData(issueDragType);
    if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(key)) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[contenteditable="true"][role="textbox"]') : null;
    if (!target) return;
    // Use the drop location when the browser exposes a caret there; otherwise
    // retain the editor's selection, just as a normal paste does.
    target.focus();
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range && target.contains(range.startContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer });
    target.dispatchEvent(paste);
    if (paste.defaultPrevented) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener("drop", drop, true);
  return () => document.removeEventListener("drop", drop, true);
}
