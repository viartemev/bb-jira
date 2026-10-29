import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { issueDragType, mountIssueDrops } from "../issue-drag";

test("native Jira drags accept composer padding, target the right editor, and clean up", () => {
  const dom = new JSDOM(`<form id="first"><div role="textbox" contenteditable="true"></div><button>Send</button></form>
    <form id="second"><div role="textbox" contenteditable="true"><p>Draft</p></div><div id="padding"></div></form>
    <form id="jql"><input /></form>`);
  for (const name of ["window", "document", "Element", "HTMLElement", "Node"] as const) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? dom.window : name === "document" ? dom.window.document : dom.window[name], configurable: true });
  }
  class Clipboard extends dom.window.Event {
    clipboardData: DataTransfer | null;
    constructor(type: string, init: ClipboardEventInit) { super(type, init); this.clipboardData = init.clipboardData ?? null; }
  }
  Object.defineProperty(globalThis, "ClipboardEvent", { value: Clipboard, configurable: true });
  const transfer = { types: [issueDragType, "text/html"], dropEffect: "none", getData: (type: string): string => type === issueDragType ? "APP-7" : "" };
  const send = (target: Element, type: string, data = transfer) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { dataTransfer: data, clientX: 5, clientY: 5 });
    target.dispatchEvent(event);
    return event;
  };
  const doc = dom.window.document;
  const padding = doc.querySelector("#padding")!;
  const form = doc.querySelector("#second")!;
  const editor = form.querySelector('[role="textbox"]')!;
  const pastes: Event[] = [];
  editor.addEventListener("paste", event => { pastes.push(event); event.preventDefault(); });
  let wrongEditorPastes = 0;
  doc.querySelector('#first [role="textbox"]')!.addEventListener("paste", () => { wrongEditorPastes++; });
  const dispose = mountIssueDrops();
  try {
    // During a real browser dragover, the payload is protected: only types are readable.
    const protectedData = { ...transfer, getData: () => "" };
    assert.equal(send(padding, "dragover", protectedData).defaultPrevented, true);
    assert.equal(protectedData.dropEffect, "copy");
    assert.equal(form.classList.contains("outline-primary"), true);
    assert.equal(pastes.length, 0);
    assert.equal(send(padding, "drop").defaultPrevented, true);
    assert.equal(pastes.length, 1);
    assert.equal(pastes[0].target, editor);
    assert.equal(wrongEditorPastes, 0);
    assert.equal(form.classList.contains("outline-primary"), false);
    assert.equal(editor.textContent, "Draft");
    assert.equal(send(doc.querySelector("#jql input")!, "dragover").defaultPrevented, false);
    assert.equal(send(padding, "dragover", { ...transfer, types: ["Files"] }).defaultPrevented, false);
    assert.equal(send(padding, "drop", { ...transfer, getData: () => "invalid" }).defaultPrevented, false);
    send(padding, "dragover");
    dispose();
    assert.equal(form.classList.contains("outline-primary"), false);
    assert.equal(send(padding, "dragover").defaultPrevented, false);
    send(padding, "drop");
    assert.equal(pastes.length, 1);
  } finally { dispose(); dom.window.close(); }
});
