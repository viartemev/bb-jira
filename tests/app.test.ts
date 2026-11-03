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
  const issue = { key: "APP-7", summary: "Checkout", status: "Done", statusId: "3", assignee: "Sam", priority: "High", type: "Bug", url: "https://jira.example.test/browse/APP-7" };
  const { JiraSidePanel } = await import("../app");
  assert.equal(panel.component, JiraSidePanel);
  const issueQueries: string[] = [];
  const slot = renderSlot({ component: JiraSidePanel }, {}, {
    pluginId: "jira-boards", composer: { scope: { kind: "thread", threadId: "t1" }, text: "Please investigate" },
    rpc: { boards: () => ({ boards: [{ id: 9, name: "Team", type: "scrum" }], next: null }),
      quick_filters: () => ({ available: true, filters: [{ id: "mine", name: "Only mine", jql: "assignee = currentUser()", description: "" }, { id: "bugs", name: "Bugs", jql: "issuetype = Bug", description: "" }] }),
      columns: () => [{ name: "To do", statusIds: ["1"] }, { name: "Done", statusIds: ["2", "3"] }],
      issues: input => { const { startAt, jql } = input as { startAt: number; jql: string }; issueQueries.push(jql); return { issues: [startAt ? { ...issue, key: "APP-8", summary: "Second task", assignee: "Jordan", status: "To do", statusId: "1" } : issue], startAt, total: 2, next: startAt ? null : 1 }; },
      issue: () => ({ issue, description: "Steps", fields: {}, comments: [], commentsTotal: 0, attachments: [], links: [], subtasks: [], updated: "" }),
    },
  });
  try {
    await slot.findByText("Checkout");
    assert.equal(slot.queryByRole("button", { name: "Refresh" }), null);
    assert.equal(slot.queryByRole("button", { name: "Test connection" }), null);
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
    assert.match(JSON.stringify(pill), /"pluginId":"jira-boards"/);
    assert.match(JSON.stringify(pill), /"provider":"issue"/);
    assert.equal(slot.inspection.composer.draft.mentions.length, 0, "Starting or cancelling a drag must not change the draft");
    fireEvent.click([...card.querySelectorAll("button")].find(button => button.textContent === "Add to chat")!);
    assert.equal(slot.inspection.composer.text.includes("Please investigate"), true);
    assert.equal(slot.inspection.composer.draft.mentions.length, 1);
    assert.match(JSON.stringify(slot.inspection.composer.draft.mentions[0]), /APP-7/);
    assert.match(JSON.stringify(slot.inspection.composer.draft.mentions[0]), /"provider":"issue"/);
    assert.equal(slot.inspection.composer.submits.length, 0);
    fireEvent.click(slot.getByRole("button", { name: /APP-7 · Bug/ }));
    await slot.findByText("Steps");
    fireEvent.click(slot.getByRole("button", { name: "New chat" }));
    await waitFor(() => assert.match(JSON.stringify(slot.inspection.navigateCalls), /jira_issue/));
    // A completed first page must not hide another person's active task on page two.
    await slot.findByText("Second task");
    await slot.findByText("2 of 2 tasks");
    const activeLane = slot.getByLabelText("Assignee: Jordan");
    const doneLane = slot.getByLabelText("Assignee: Sam");
    assert.ok(activeLane.contains(slot.getByRole("button", { name: /APP-8 · Bug/ })));
    assert.ok(doneLane.contains(slot.getByRole("button", { name: /APP-7 · Bug/ })));
    assert.ok(slot.getByLabelText("Jordan: To do").contains(slot.getByRole("button", { name: /APP-8 · Bug/ })));
    const before = slot.inspection.rpcCalls.filter(call => call.method === "issues").length;
    fireEvent.click(slot.getByRole("button", { name: "Refresh board" }));
    await waitFor(() => assert.equal(slot.inspection.rpcCalls.filter(call => call.method === "issues").length, before + 2));
    await slot.findByText("2 of 2 tasks");
    assert.ok(slot.getByLabelText("Assignee: Jordan"));
    fireEvent.click(slot.getByRole("button", { name: "Only mine" }));
    await waitFor(() => assert.equal(issueQueries.at(-1), "(assignee = currentUser())"));
    fireEvent.click(slot.getByRole("button", { name: "Bugs" }));
    await waitFor(() => assert.equal(issueQueries.at(-1), "(assignee = currentUser()) AND (issuetype = Bug)"));
    fireEvent.click(slot.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => assert.equal(issueQueries.at(-1), ""));
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});

test("a large board stops at the task limit and loads more on request", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { JiraPanel, boardTaskLimit } = await import("../app");
  assert.equal(boardTaskLimit, 1000);
  const starts: number[] = [];
  const task = (n: number) => ({ key: `APP-${n}`, summary: `Task ${n}`, status: "To do", statusId: "1", assignee: "Sam", priority: "Low", type: "Task", url: `https://jira.example.test/browse/APP-${n}` });
  const slot = renderSlot({ component: JiraPanel }, { taskLimit: 4 }, { pluginId: "jira-boards", rpc: {
    boards: () => ({ boards: [{ id: 9, name: "Team", type: "kanban" }], next: null }),
    quick_filters: () => ({ available: true, filters: [] }),
    columns: () => [{ name: "To do", statusIds: ["1"] }],
    issues: input => { const { startAt } = input as { startAt: number }; starts.push(startAt); return { issues: [task(startAt + 1), task(startAt + 2)], startAt, total: 10, next: startAt + 2 < 10 ? startAt + 2 : null }; },
  } });
  try {
    await slot.findByText("4 of 10 tasks");
    await slot.findByRole("button", { name: "Load more tasks" });
    assert.deepEqual(starts, [0, 2]);
    fireEvent.click(slot.getByRole("button", { name: "Load more tasks" }));
    await slot.findByText("8 of 10 tasks");
    assert.deepEqual(starts, [0, 2, 4, 6]);
    fireEvent.click(await slot.findByRole("button", { name: "Load more tasks" }));
    await slot.findByText("10 of 10 tasks");
    await waitFor(() => assert.equal(slot.queryByRole("button", { name: "Load more tasks" }), null));
    assert.deepEqual(starts, [0, 2, 4, 6, 8]);
    assert.ok(slot.getByText("Task 10"));
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});

test("switching boards stops pagination and ignores a late response from the previous board", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { JiraSidePanel } = await import("../app");
  const issue = { key: "OLD-1", summary: "Old task", status: "Done", statusId: "1", assignee: "Sam", priority: "Low", type: "Task", url: "https://jira.example.test/browse/OLD-1" };
  let release!: (value: unknown) => void;
  const delayed = new Promise(resolve => { release = resolve; });
  const calls: { boardId: number; startAt: number }[] = [];
  const slot = renderSlot({ component: JiraSidePanel }, {}, { pluginId: "jira-boards", rpc: {
    boards: () => ({ boards: [{ id: 1, name: "Old board", type: "kanban" }, { id: 2, name: "New board", type: "kanban" }], next: null }),
    quick_filters: () => ({ available: true, filters: [] }),
    columns: () => [{ name: "Done", statusIds: ["1"] }],
    issues: input => {
      const args = input as { boardId: number; startAt: number }; calls.push(args);
      if (args.boardId === 2) return { issues: [{ ...issue, key: "NEW-1", summary: "New task" }], startAt: 0, total: 1, next: null };
      return args.startAt ? delayed : { issues: [issue], startAt: 0, total: 3, next: 1 };
    },
  } });
  try {
    await waitFor(() => assert.ok(calls.some(call => call.boardId === 1 && call.startAt === 1)));
    fireEvent.change(slot.getByRole("combobox", { name: "Board" }), { target: { value: "2" } });
    await slot.findByText("New task");
    release({ issues: [{ ...issue, key: "OLD-2", summary: "Late old task" }], startAt: 1, total: 3, next: 2 });
    await new Promise(setImmediate);
    assert.equal(slot.queryByText("Late old task"), null);
    assert.ok(slot.getByText("New task"));
    assert.equal(calls.some(call => call.boardId === 1 && call.startAt === 2), false);
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});

test("issue detail writes a comment, moves the ticket through a transition and assigns it to me", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent } = await import("@testing-library/react");
  const { JiraSidePanel } = await import("../app");
  let status = "To do";
  const issue = () => ({ key: "APP-7", summary: "Checkout", status, statusId: status === "To do" ? "1" : "3", assignee: "Sam", priority: "High", type: "Bug", url: "https://jira.example.test/browse/APP-7" });
  const slot = renderSlot({ component: JiraSidePanel }, {}, { pluginId: "jira-boards", rpc: {
    boards: () => ({ boards: [{ id: 9, name: "Team", type: "scrum" }], next: null }),
    quick_filters: () => ({ available: true, filters: [] }),
    columns: () => [{ name: "To do", statusIds: ["1"] }, { name: "In progress", statusIds: ["3"] }],
    issues: input => { const { startAt } = input as { startAt: number }; return { issues: startAt ? [] : [issue()], startAt, total: 1, next: null }; },
    issue: () => ({ issue: issue(), description: "Steps", fields: {}, comments: [], commentsTotal: 0, attachments: [], links: [], subtasks: [], updated: "" }),
    transitions: () => [{ id: "31", name: "Start progress", to: "In progress", toId: "3" }],
    add_comment: input => ({ id: "501", author: "Sam", created: "now", body: (input as { body: string }).body }),
    transition: () => { status = "In progress"; return { key: "APP-7", status }; },
    assign_to_me: () => ({ key: "APP-7", assignee: "Alex" }),
  } });
  try {
    await slot.findByText("Checkout");
    fireEvent.click(slot.getByRole("button", { name: /APP-7 · Bug/ }));
    await slot.findByText("Steps");
    const select = await slot.findByLabelText("Move issue to another status") as HTMLSelectElement;
    await slot.findByRole("option", { name: "Start progress → In progress" });
    assert.equal(select.value, "");
    assert.equal((slot.getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled, true);
    const box = slot.getByLabelText("Write a comment") as HTMLTextAreaElement;
    assert.equal(box.maxLength, 32767);
    fireEvent.change(box, { target: { value: "привет" } });
    fireEvent.click(slot.getByRole("button", { name: "Comment" }));
    await slot.findByText("APP-7: comment added.");
    assert.deepEqual(slot.inspection.rpcCalls.filter(call => call.method === "add_comment").map(call => call.input), [{ key: "APP-7", body: "привет" }]);
    assert.equal((slot.getByLabelText("Write a comment") as HTMLTextAreaElement).value, "");
    await slot.findByRole("option", { name: "Start progress → In progress" });
    fireEvent.change(slot.getByLabelText("Move issue to another status"), { target: { value: "31" } });
    fireEvent.click(slot.getByRole("button", { name: "Move" }));
    await slot.findByText("APP-7: status is now In progress.");
    assert.deepEqual(slot.inspection.rpcCalls.filter(call => call.method === "transition").map(call => call.input), [{ key: "APP-7", transitionId: "31" }]);
    fireEvent.click(await slot.findByRole("button", { name: "Assign to me" }));
    await slot.findByText("APP-7: assigned to Alex.");
    assert.deepEqual(slot.inspection.rpcCalls.filter(call => call.method === "assign_to_me").map(call => call.input), [{ key: "APP-7" }]);
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});

test("swimlanes group by assignee, epic or parent, priority, or not at all", async () => {
  const { swimlanes } = await import("../app");
  const base = { status: "To do", statusId: "1", type: "Task", url: "" };
  const issues = [
    { ...base, key: "A-1", summary: "One", assignee: "Unassigned", priority: "Low", priorityId: "4" },
    { ...base, key: "A-2", summary: "Two", assignee: "Sam", assigneeId: "s", priority: "Highest", priorityId: "1", parentKey: "A-10", parentSummary: "Epic" },
    { ...base, key: "A-3", summary: "Three", assignee: "Alex", assigneeId: "a", priority: "", parentKey: "A-9", parentSummary: "Other" },
    { ...base, key: "A-4", summary: "Four", assignee: "Sam", assigneeId: "s", priority: "Medium", priorityId: "3", parentKey: "A-10", parentSummary: "Epic" },
  ];
  const view = (g: Parameters<typeof swimlanes>[1]) => swimlanes(issues, g).map(l => [l.name, l.items.map(i => i.key).join(",")]);
  assert.deepEqual(view("assignee"), [["Alex", "A-3"], ["Sam", "A-2,A-4"], ["Unassigned", "A-1"]]);
  assert.deepEqual(view("parent"), [["A-9 Other", "A-3"], ["A-10 Epic", "A-2,A-4"], ["No epic or parent", "A-1"]]);
  assert.deepEqual(view("priority"), [["Highest", "A-2"], ["Medium", "A-4"], ["Low", "A-1"], ["No priority", "A-3"]]);
  assert.deepEqual(view("none"), [["All tasks", "A-1,A-2,A-3,A-4"]]);
});

test("the board footer switches swimlane grouping", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent } = await import("@testing-library/react");
  const { JiraSidePanel } = await import("../app");
  const issue = { key: "APP-7", summary: "Checkout", status: "To do", statusId: "1", assignee: "Sam", priority: "High", priorityId: "2", type: "Bug", url: "", parentKey: "APP-1", parentSummary: "Payments" };
  const slot = renderSlot({ component: JiraSidePanel }, {}, { pluginId: "jira-boards", rpc: {
    boards: () => ({ boards: [{ id: 9, name: "Team", type: "kanban" }], next: null }),
    quick_filters: () => ({ available: true, filters: [] }),
    columns: () => [{ name: "To do", statusIds: ["1"] }],
    issues: () => ({ issues: [issue], startAt: 0, total: 1, next: null }),
  } });
  try {
    await slot.findByLabelText("Assignee: Sam");
    const select = slot.getByLabelText("Swimlanes");
    fireEvent.change(select, { target: { value: "parent" } });
    assert.ok((await slot.findByLabelText("Epic or parent: APP-1 Payments")).contains(slot.getByText("Checkout")));
    fireEvent.change(select, { target: { value: "priority" } });
    await slot.findByLabelText("Priority: High");
    fireEvent.change(select, { target: { value: "none" } });
    assert.ok(slot.getByLabelText("To do").contains(slot.getByText("Checkout")));
    assert.equal(slot.queryByLabelText(/^(Assignee|Priority|Epic or parent):/), null);
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});

test("the board reopens on the saved board, filters and grouping, and saves changes", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { JiraSidePanel } = await import("../app");
  const issue = { key: "APP-7", summary: "Checkout", status: "To do", statusId: "1", assignee: "Sam", priority: "High", priorityId: "2", type: "Bug", url: "" };
  const saved: unknown[] = [];
  const loads: { boardId: number; jql: string }[] = [];
  const slot = renderSlot({ component: JiraSidePanel }, {}, { pluginId: "jira-boards", rpc: {
    boards: () => ({ boards: [{ id: 1, name: "First", type: "kanban" }, { id: 2, name: "Second", type: "kanban" }], next: null }),
    view_state: () => ({ boardId: 2, jql: "project = APP", quickFilterIds: ["bugs"], grouping: "priority" }),
    save_view_state: input => { saved.push(input); return null; },
    quick_filters: () => ({ available: true, filters: [{ id: "bugs", name: "Bugs", jql: "issuetype = Bug", description: "" }] }),
    columns: () => [{ name: "To do", statusIds: ["1"] }],
    issues: input => { const { boardId, jql } = input as { boardId: number; jql: string }; loads.push({ boardId, jql }); return { issues: [issue], startAt: 0, total: 1, next: null }; },
  } });
  try {
    await slot.findByLabelText("Priority: High");
    assert.equal((slot.getByLabelText("Board") as HTMLSelectElement).value, "2");
    assert.equal((slot.getByLabelText("Filter board using JQL") as HTMLInputElement).value, "project = APP");
    assert.equal(slot.getByRole("button", { name: "Bugs" }).getAttribute("aria-pressed"), "true");
    assert.deepEqual(loads, [{ boardId: 2, jql: "(project = APP) AND (issuetype = Bug)" }], "the saved view loads the board once, with its quick filter");
    await waitFor(() => assert.ok(saved.length > 0));
    assert.deepEqual(saved.at(-1), { boardId: 2, jql: "project = APP", quickFilterIds: ["bugs"], grouping: "priority" });
    fireEvent.change(slot.getByLabelText("Swimlanes"), { target: { value: "none" } });
    await waitFor(() => assert.deepEqual(saved.at(-1), { boardId: 2, jql: "project = APP", quickFilterIds: ["bugs"], grouping: "none" }));
    fireEvent.change(slot.getByLabelText("Board"), { target: { value: "1" } });
    await waitFor(() => assert.deepEqual(saved.at(-1), { boardId: 1, jql: "project = APP", quickFilterIds: [], grouping: "none" }));
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});
