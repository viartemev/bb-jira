import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("Jira panels load boards and add a real plugin mention without sending the draft", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { loadPluginApp, renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const app = await loadPluginApp(() => import("../app"));
  assert.equal(app.navPanels[0].id, "boards");
  const issue = { key: "APP-7", summary: "Checkout", status: "Doing", statusId: "2", assignee: "Sam", priority: "High", type: "Bug", url: "https://jira.example.test/browse/APP-7" };
  const slot = renderSlot(app.navPanels[0], { subPath: "" }, {
    pluginId: "jira", composer: { scope: { kind: "thread", threadId: "t1" }, text: "Please investigate" },
    rpc: { boards: () => ({ boards: [{ id: 9, name: "Team", type: "scrum" }], next: null }),
      columns: () => [{ name: "Doing", statusIds: ["2", "3"] }],
      issues: () => ({ issues: [issue], startAt: 0, total: 1, next: null }),
      issue: () => ({ issue, description: "Steps", fields: {}, comments: [], commentsTotal: 0, attachments: [], links: [], subtasks: [], updated: "" }),
    },
  });
  try {
    await slot.findByText("Checkout");
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
