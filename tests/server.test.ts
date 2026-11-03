import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

test("backend surfaces validate inputs, use fresh secrets and resolve issue mentions", async () => {
  const original = globalThis.fetch;
  const auth: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input)); auth.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (url.pathname.endsWith("/comment")) return Response.json({ comments: [], total: 0 });
    if (url.pathname.includes("/issue/")) return Response.json({ key: "APP-7", fields: { summary: "Checkout", description: "Task context", customfield_1: "Acceptance criteria" } });
    return Response.json({ values: [], isLast: true });
  }) as typeof fetch;
  const { bb, harness } = createFakePluginHost({ pluginId: "jira-boards", settings: { baseUrl: "https://jira.example.test", pat: "fake-first" } });
  try {
    await plugin(bb);
    const patSetting = harness.registrations.settingsDescriptors.pat;
    assert.ok(patSetting.type === "string" && patSetting.secret);
    await harness.behavior.callRpc("boards", {});
    assert.deepEqual(await harness.behavior.callRpc("quick_filters", { boardId: 77 }), { available: true, filters: [] });
    await assert.rejects(harness.behavior.callRpc("quick_filters", { boardId: -1 }));
    await assert.rejects(harness.behavior.callRpc("issues", { boardId: -1 }));
    await harness.behavior.setSettings({ pat: "fake-second" });
    const result = await harness.behavior.callAgentTool("jira_issue", { key: "APP-7" });
    assert.match(JSON.stringify(result), /Task context/);
    assert.match(JSON.stringify(result), /Acceptance criteria/);
    assert.deepEqual(JSON.parse(String(await harness.behavior.callAgentTool("jira_issue", { key: "APP-7", field: "customfield_1" }))), { field: "customfield_1", name: "customfield_1", value: '"Acceptance criteria"', next: null });
    const mention = harness.registrations.mentionProviders[0];
    const resolved = await mention.resolve("APP-7");
    assert.match(resolved.context, /Task context/);
    assert.ok(!resolved.context.includes("fake-second"));
    assert.equal(auth[0], "Bearer fake-first");
    assert.equal(auth.at(-1), "Bearer fake-second");
    assert.equal((await harness.behavior.runCli(["boards", "--help"])).exitCode, 0);
    await assert.rejects(harness.behavior.setSettings({ baseUrl: "http://insecure.test" }));
    await assert.rejects(harness.behavior.setSettings({ boardIds: "../../secrets" }));
  } finally { globalThis.fetch = original; await harness.lifecycle.dispose(); }
});
test("@ search looks up an exact key cheaply and treats a missing key as no match", async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async input => {
    const url = new URL(String(input)); requests.push(url);
    if (url.pathname.endsWith("/issue/APP-404")) return new Response("Not found", { status: 404 });
    if (url.pathname.endsWith("/issue/APP-403")) return new Response("No", { status: 403 });
    return Response.json({ key: "APP-7", fields: { summary: "Checkout", status: { id: "3", name: "In progress" } } });
  }) as typeof fetch;
  const { bb, harness } = createFakePluginHost({ pluginId: "jira-boards", settings: { baseUrl: "https://jira.example.test", pat: "fake-secret" } });
  try {
    await plugin(bb);
    const mention = harness.registrations.mentionProviders[0];
    assert.deepEqual(await mention.search({ query: "app-7" } as any), [{ id: "APP-7", title: "APP-7 Checkout", subtitle: "In progress" }]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].searchParams.get("fields"), "summary,status,assignee,priority,issuetype");
    assert.deepEqual(await mention.search({ query: "APP-404" } as any), []);
    await assert.rejects(async () => mention.search({ query: "APP-403" } as any), /HTTP 403/);
  } finally { globalThis.fetch = original; await harness.lifecycle.dispose(); }
});
test("plugin imports use public SDK only", async () => {
  const report = await experimental_scanPublicSdkOnly(process.cwd(), { allow: [/^(react|@radix-ui\/react-slot|class-variance-authority|clsx|tailwind-merge|jsdom|@testing-library\/react)$/] });
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.privateDependencies, []);
});

test("write surfaces post comments and transitions with validated input", async () => {
  const original = globalThis.fetch;
  const writes: { method?: string; path: string; body: any; auth: string | null }[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input)); const method = init?.method ?? "GET";
    writes.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("Authorization") ?? null });
    if (url.pathname.endsWith("/transitions") && method === "POST") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/transitions")) return Response.json({ transitions: [{ id: "31", name: "Start progress", to: { id: "3", name: "In progress" } }] });
    if (url.pathname.endsWith("/issue/APP-7/comment") && method === "POST") return Response.json({ id: "501", author: { displayName: "Sam" }, created: "now", body: "привет" });
    if (url.pathname.endsWith("/comment")) return Response.json({ comments: [], total: 0 });
    if (url.pathname.endsWith("/myself")) return Response.json({ name: "sam", displayName: "Sam" });
    if (url.pathname.endsWith("/assignee") && method === "PUT") return new Response(null, { status: 204 });
    if (url.searchParams.get("fields") === "assignee") return Response.json({ key: "APP-7", fields: { assignee: { displayName: "Sam" } } });
    if (url.searchParams.get("fields") === "status") return Response.json({ key: "APP-7", fields: { status: { id: "3", name: "In progress" } } });
    return Response.json({ key: "APP-7", fields: { summary: "Checkout", status: { id: "3", name: "In progress" } } });
  }) as typeof fetch;
  const { bb, harness } = createFakePluginHost({ pluginId: "jira-boards", settings: { baseUrl: "https://jira.example.test", pat: "fake-secret" } });
  try {
    await plugin(bb);
    assert.deepEqual(await harness.behavior.callRpc("add_comment", { key: "APP-7", body: "привет" }), { id: "501", author: "Sam", created: "now", body: "привет" });
    assert.deepEqual(writes[0], { method: "POST", path: "/rest/api/2/issue/APP-7/comment", body: { body: "привет" }, auth: "Bearer fake-secret" });
    assert.deepEqual(await harness.behavior.callRpc("transitions", { key: "APP-7" }), [{ id: "31", name: "Start progress", to: "In progress", toId: "3" }]);
    assert.deepEqual(await harness.behavior.callRpc("transition", { key: "APP-7", transitionId: "31", comment: "done" }), { key: "APP-7", status: "In progress" });
    const transitionWrite = writes.find(w => w.method === "POST" && w.path.endsWith("/transitions"))!;
    assert.deepEqual(transitionWrite.body, { transition: { id: "31" }, update: { comment: [{ add: { body: "done" } }] } });
    await assert.rejects(harness.behavior.callRpc("add_comment", { key: "APP-7", body: "  " }));
    await assert.rejects(harness.behavior.callRpc("add_comment", { key: "APP-7", body: "x".repeat(32_768) }));
    await assert.rejects(harness.behavior.callRpc("transition", { key: "APP-7", transitionId: "../../rest/api/2/myself" }));
    await assert.rejects(harness.behavior.callRpc("add_comment", { key: "APP-7/../../myself", body: "hi" }));
    assert.match(String(await harness.behavior.callAgentTool("jira_comment", { key: "APP-7", body: "привет" })), /501/);
    assert.match(String(await harness.behavior.callAgentTool("jira_transitions", { key: "APP-7" })), /Start progress/);
    assert.deepEqual(JSON.parse(String(await harness.behavior.callAgentTool("jira_related", { key: "APP-7" }))), { key: "APP-7", related: [], truncated: false });
    assert.equal((await harness.behavior.runCli(["related", "APP-7"])).exitCode, 0);
    await assert.rejects(harness.behavior.callAgentTool("jira_attachment", { id: "../myself" }));
    assert.match(String(await harness.behavior.callAgentTool("jira_transition", { key: "APP-7", transitionId: "31" })), /In progress/);
    const cliComment = await harness.behavior.runCli(["comment", "APP-7", "--body", "привет"]);
    assert.equal(cliComment.exitCode, 0);
    assert.match(cliComment.stdout, /"key":"APP-7"/);
    const cliTransitions = await harness.behavior.runCli(["transitions", "APP-7"]);
    assert.equal(cliTransitions.exitCode, 0);
    assert.match(cliTransitions.stdout, /Start progress/);
    const cliTransition = await harness.behavior.runCli(["transition", "APP-7", "--to", "31", "--comment", "done"]);
    assert.equal(cliTransition.exitCode, 0);
    assert.match(cliTransition.stdout, /In progress/);
    assert.deepEqual(await harness.behavior.callRpc("assign_to_me", { key: "APP-7" }), { key: "APP-7", assignee: "Sam" });
    assert.deepEqual(writes.filter(w => w.method === "PUT").map(w => [w.path, w.body]), [["/rest/api/2/issue/APP-7/assignee", { name: "sam" }]]);
    assert.match(String(await harness.behavior.callAgentTool("jira_assign_to_me", { key: "APP-7" })), /"assignee":"Sam"/);
    const cliAssign = await harness.behavior.runCli(["assign-to-me", "APP-7"]);
    assert.equal(cliAssign.exitCode, 0);
    assert.match(cliAssign.stdout, /"assignee":"Sam"/);
    await assert.rejects(harness.behavior.callRpc("assign_to_me", { key: "../myself" }));
    assert.equal(writes.every(w => w.auth === "Bearer fake-secret"), true);
  } finally { globalThis.fetch = original; await harness.lifecycle.dispose(); }
});

test("the board view is saved per user and a damaged saved view is ignored", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "jira-boards", settings: { baseUrl: "https://jira.example.test", pat: "fake-secret" } });
  try {
    await plugin(bb);
    assert.equal(await harness.behavior.callRpc("view_state", null), null);
    const view = { boardId: 9, jql: "project = APP", quickFilterIds: ["12"], grouping: "priority" };
    await harness.behavior.callRpc("save_view_state", view);
    assert.deepEqual(await harness.behavior.callRpc("view_state", null), view);
    await assert.rejects(harness.behavior.callRpc("save_view_state", { ...view, grouping: "sprint" }));
    await assert.rejects(harness.behavior.callRpc("save_view_state", { ...view, jql: "x".repeat(4001) }));
    await bb.storage.kv.set("view-state", { boardId: "nine" });
    assert.equal(await harness.behavior.callRpc("view_state", null), null);
  } finally { await harness.lifecycle.dispose(); }
});
