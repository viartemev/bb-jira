export const issueDragType = "application/x-bb-jira-issue";

/** Route our native drops through BB's public mention clipboard format.
 * BB's editor understands mention HTML on paste, but its generic drop path
 * otherwise flattens that HTML into text. No draft or editor internals are used.
 */
export function mountIssueDrops() {
  let highlighted: HTMLElement | null = null;
  const clear = () => {
    highlighted?.classList.remove("outline", "outline-2", "outline-primary");
    highlighted = null;
  };
  const editorAt = (event: globalThis.DragEvent) => {
    if (!event.dataTransfer?.types.includes(issueDragType) || !(event.target instanceof Element)) return null;
    const editor = event.target.closest<HTMLElement>('[contenteditable="true"][role="textbox"]');
    // The visible input includes padding, attachments and controls outside the
    // editable element. Accept those too, but never a different form (JQL, etc.).
    return editor ?? event.target.closest("form")?.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]') ?? null;
  };
  const over = (event: globalThis.DragEvent) => {
    const editor = editorAt(event);
    if (!editor) { clear(); return; }
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    const box = editor.closest("form") ?? editor;
    if (highlighted !== box) {
      clear();
      highlighted = box;
      highlighted.classList.add("outline", "outline-2", "outline-primary");
    }
  };
  const drop = (event: globalThis.DragEvent) => {
    clear();
    const transfer = event.dataTransfer;
    if (!transfer?.types.includes(issueDragType)) return;
    const key = transfer.getData(issueDragType);
    if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(key)) return;
    const target = editorAt(event);
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
  const leave = (event: globalThis.DragEvent) => {
    if (!highlighted || !(event.relatedTarget instanceof Node) || !highlighted.contains(event.relatedTarget)) clear();
  };
  document.addEventListener("dragover", over, true);
  document.addEventListener("dragleave", leave, true);
  document.addEventListener("dragend", clear, true);
  document.addEventListener("drop", drop, true);
  return () => {
    clear();
    document.removeEventListener("dragover", over, true);
    document.removeEventListener("dragleave", leave, true);
    document.removeEventListener("dragend", clear, true);
    document.removeEventListener("drop", drop, true);
  };
}
