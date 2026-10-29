import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("Jira side panel keeps the chat open and supports mention insertion and dragging", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { loadPluginApp, renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const app = await loadPluginApp(() => import("../app"));
  assert.equal(app.navPanels.length, 0, "Jira must not navigate away from the current chat");
  assert.equal(app.experimentalSidebarFooterItems.length, 0, "Jira must use the full side panel");
  const panel = app.tabs.find(tab => tab.id === "jira")!;
  assert.equal(panel.context.kind, "thread");
  assert.equal(panel.availability, "action");
  assert.equal(panel.layout, "flush");
  assert.equal(app.newThreadPanelActions[0].id, "jira");
  assert.equal(app.threadActions[0].placement, "header");
  const issue = { key: "APP-7", summary: "Checkout", status: "Doing", statusId: "2", assignee: "Sam", priority: "High", type: "Bug", url: "https://jira.example.test/browse/APP-7" };
  const { JiraSidePanel } = await import("../app");
  assert.equal(panel.component, JiraSidePanel);
  const slot = renderSlot({ component: JiraSidePanel }, {}, {
    pluginId: "jira", composer: { scope: { kind: "thread", threadId: "t1" }, text: "Please investigate" },
    rpc: { boards: () => ({ boards: [{ id: 9, name: "Team", type: "scrum" }], next: null }),
      columns: () => [{ name: "Doing", statusIds: ["2", "3"] }],
      issues: () => ({ issues: [issue], startAt: 0, total: 1, next: null }),
      issue: () => ({ issue, description: "Steps", fields: {}, comments: [], commentsTotal: 0, attachments: [], links: [], subtasks: [], updated: "" }),
    },
  });
  try {
    await slot.findByText("Checkout");
    assert.equal(slot.inspection.navigateCalls.length, 0);
    const card = slot.getByRole("button", { name: /APP-7 · Bug/ }).closest("article")!;
    assert.equal(card.draggable, true);
    const transfer = { effectAllowed: "", data: new Map<string, string>(), setData(type: string, value: string) { this.data.set(type, value); } };
    fireEvent.dragStart(card, { dataTransfer: transfer });
    assert.equal(transfer.effectAllowed, "copy");
    assert.equal(transfer.data.get("text/plain"), "@APP-7");
    const clipboard = dom.window.document.createElement("div");
    clipboard.innerHTML = transfer.data.get("text/html")!;
    const { experimental_readPromptMentionClipboard } = await import("@get-bb/plugin-sdk/app");
    const pill = experimental_readPromptMentionClipboard(clipboard.firstElementChild!);
    assert.equal(pill?.mention.kind, "plugin");
    assert.equal(pill?.mention.id, "APP-7");
    assert.match(JSON.stringify(pill), /"pluginId":"jira"/);
    assert.match(JSON.stringify(pill), /"provider":"issue"/);
    assert.equal(slot.inspection.composer.draft.mentions.length, 0, "Starting or cancelling a drag must not change the draft");
    fireEvent.click(slot.getByRole("button", { name: "Add to chat" }));
    assert.equal(slot.inspection.composer.text.includes("Please investigate"), true);
    assert.equal(slot.inspection.composer.draft.mentions.length, 1);
    assert.match(JSON.stringify(slot.inspection.composer.draft.mentions[0]), /APP-7/);
    assert.match(JSON.stringify(slot.inspection.composer.draft.mentions[0]), /"provider":"issue"/);
    assert.equal(slot.inspection.composer.submits.length, 0);
    fireEvent.click(slot.getByRole("button", { name: /APP-7 · Bug/ }));
    await slot.findByText("Steps");
    fireEvent.click(slot.getByRole("button", { name: "New chat" }));
    await waitFor(() => assert.match(JSON.stringify(slot.inspection.navigateCalls), /jira_issue/));
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});
