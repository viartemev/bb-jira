import { test } from "node:test";
import assert from "node:assert/strict";
import { JiraClient, normalizeBaseUrl, parseBoardIds, plainText, issueContext, keySchema, type JiraSettings } from "../jira";

const settings: JiraSettings = { baseUrl: "https://jira.example.test/jira/", pat: "test-token-never-real", authMode: "pat", email: "", boardIds: "" };
const rawIssue = { key: "APP-7", fields: { summary: "Fix checkout", description: "Steps to reproduce", status: { id: "2", name: "In progress" }, customfield_123: "Acceptance criteria", attachment: [{ id: "5", filename: "trace.txt", mimeType: "text/plain", size: 20 }], subtasks: [], issuelinks: [{ type: { inward: "is blocked by" }, inwardIssue: { key: "APP-6", fields: { summary: "Dependency" } } }] } };
const fake = (fn: (url: URL, init?: RequestInit) => unknown): typeof fetch => (async (input, init) => Response.json(fn(new URL(String(input)), init))) as typeof fetch;

test("PAT stays in header; requests preserve Jira context path and never follow redirects", async () => {
  const client = new JiraClient(settings, fake((url, init) => {
    assert.equal(url.pathname, "/jira/rest/agile/1.0/board");
    assert.equal(url.searchParams.get("startAt"), "50");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token-never-real");
    assert.equal(init?.redirect, "error");
    assert.equal(url.href.includes("test-token"), false);
    return { values: [{ id: 9, name: "Team", type: "scrum" }], isLast: false };
  }));
  assert.deepEqual(await client.boards(50), { boards: [{ id: 9, name: "Team", type: "scrum" }], next: 51 });
});
test("configured boards are looked up by ID, including an empty final page", async () => {
  const paths: string[] = [];
  const c = new JiraClient({ ...settings, boardIds: "8,9,8" }, fake(url => { paths.push(url.pathname); return { id: Number(url.pathname.split("/").pop()), name: "Team", type: "kanban" }; }));
  assert.equal((await c.boards()).boards.length, 2);
  assert.deepEqual(paths, ["/jira/rest/agile/1.0/board/8", "/jira/rest/agile/1.0/board/9"]);
  const empty = new JiraClient(settings, fake(() => ({ values: [], isLast: false })));
  assert.equal((await empty.boards()).next, null);
});
test("Cloud uses basic auth and enhanced search, with ADF text support", async () => {
  const c = new JiraClient({ ...settings, authMode: "cloud", email: "user@example.test" }, fake((url, init) => {
    assert.equal(url.pathname, "/jira/rest/api/3/search/jql");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Basic ${Buffer.from("user@example.test:test-token-never-real").toString("base64")}`);
    return { issues: [rawIssue], isLast: true };
  }));
  assert.equal((await c.search("key = APP-7"))[0].key, "APP-7");
  assert.equal(plainText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "mention", attrs: { text: "@Sam" } }, { type: "hardBreak" }, { type: "inlineCard", attrs: { url: "https://example.test" } }] }] }), "Hello @Sam\nhttps://example.test\n");
});
test("ADF text keeps link URLs, list markers and inline nodes", () => {
  const p = (...content: unknown[]) => ({ type: "paragraph", content });
  const t = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
  const doc = { type: "doc", content: [
    p(t("See "), t("the runbook", [{ type: "strong" }, { type: "link", attrs: { href: "https://wiki.example.test/run" } }]), t(" or "), t("https://example.test", [{ type: "link", attrs: { href: "https://example.test" } }])),
    { type: "bulletList", content: [
      { type: "listItem", content: [p(t("First")), { type: "orderedList", attrs: { order: 3 }, content: [{ type: "listItem", content: [p(t("Nested"))] }, { type: "listItem", content: [p(t("Next"))] }] }] },
      { type: "listItem", content: [p(t("Second"))] },
    ] },
    p({ type: "emoji", attrs: { shortName: ":tada:", text: "🎉" } }, t(" "), { type: "status", attrs: { text: "In review" } }, t(" due "), { type: "date", attrs: { timestamp: "1767225600000" } }),
    { type: "rule" },
    { type: "mediaSingle", content: [{ type: "media", attrs: { id: "abc", type: "file", alt: "trace.png" } }] },
  ] };
  assert.equal(plainText(doc), "See the runbook (https://wiki.example.test/run) or https://example.test\n- First\n  3. Nested\n  4. Next\n- Second\n🎉 [In review] due 2026-01-01\n---\n[attachment: trace.png]\n");
});
test("issue detail carries custom fields, links, attachment metadata and paginated comments", async () => {
  const c = new JiraClient(settings, fake(url => url.pathname.endsWith("/comment") ? { comments: [{ id: "10", author: { displayName: "Sam" }, body: "Investigating", created: "today" }], total: 60 } : rawIssue));
  const d = await c.detail("app-7");
  assert.equal(d.issue.key, "APP-7");
  assert.equal(d.fields.customfield_123, "Acceptance criteria");
  assert.equal(d.links[0].relation, "is blocked by");
  assert.equal(d.attachments[0].filename, "trace.txt");
  assert.equal(d.commentsTotal, 60);
  assert.equal((await c.comments("APP-7", 10)).next, 11);
  const context = issueContext(d);
  assert.match(context, /Investigating/); assert.match(context, /jira_comments/); assert.match(context, /Acceptance criteria/);
  d.description = "x".repeat(100_000);
  assert.ok(issueContext(d).length < 49_000); assert.match(issueContext(d), /truncated/);
});
test("issue context drops empty and duplicated fields, names custom fields and asks for the newest comments", async () => {
  const requests: URL[] = [];
  const raw = { ...rawIssue, names: { customfield_123: "Definition of done", customfield_999: "Unused", status: "Status" }, fields: { ...rawIssue.fields, description: "Only once", customfield_999: null, customfield_5: [], customfield_6: "", customfield_7: {}, status: { self: "https://jira.example.test/rest/api/2/status/2", iconUrl: "https://jira.example.test/i.png", id: "2", name: "In progress" } } };
  const c = new JiraClient(settings, fake(url => { requests.push(url); return url.pathname.endsWith("/comment") ? { comments: [], total: 0 } : raw; }));
  const d = await c.detail("APP-7");
  assert.equal(requests.find(u => u.pathname.endsWith("/APP-7"))?.searchParams.get("expand"), "names");
  assert.equal(requests.find(u => u.pathname.endsWith("/comment"))?.searchParams.get("orderBy"), "-created");
  assert.deepEqual(Object.keys(d.fields).filter(k => k.startsWith("customfield_")), ["customfield_123"]);
  assert.deepEqual(d.fieldNames, { customfield_123: "Definition of done", status: "Status" });
  const context = issueContext(d);
  assert.match(context, /"Definition of done \(customfield_123\)":"Acceptance criteria"/);
  assert.equal(context.split("Only once").length, 2);
  assert.ok(!context.includes("iconUrl") && !context.includes("/rest/api/2/status/2"));
  assert.match(context, /newest 0 of 0, newest first/);
});
test("a single field is read by ID or by name without fetching the whole issue", async () => {
  const requests: URL[] = [];
  const c = new JiraClient(settings, fake(url => {
    requests.push(url);
    if (url.pathname.endsWith("/rest/api/2/field")) return [{ id: "summary", name: "Summary" }, { id: "customfield_10020", name: "Sprint" }];
    const id = url.searchParams.get("fields")!;
    return { key: "APP-7", names: { customfield_10020: "Sprint" }, fields: id === "customfield_10020" ? { customfield_10020: [{ name: "Sprint 4" }] } : {} };
  }));
  assert.deepEqual(await c.field("APP-7", "customfield_10020"), { id: "customfield_10020", name: "Sprint", value: [{ name: "Sprint 4" }] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get("fields"), "customfield_10020");
  requests.length = 0;
  assert.deepEqual(await c.field("APP-7", "sprint"), { id: "customfield_10020", name: "Sprint", value: [{ name: "Sprint 4" }] });
  assert.deepEqual(requests.map(u => u.searchParams.get("fields") ?? u.pathname), ["sprint", "/jira/rest/api/2/field", "customfield_10020"]);
  assert.deepEqual(await c.field("APP-7", "No such field"), { id: "No such field", name: "No such field", value: null });
});
test("board issue pagination and multi-status column mapping", async () => {
  const c = new JiraClient(settings, fake(url => {
    if (url.pathname.endsWith("/configuration")) return { columnConfig: { columns: [{ name: "Doing", statuses: [{ id: "2" }, { id: "3" }] }] } };
    assert.equal(url.searchParams.get("jql"), "assignee = currentUser()");
    return { issues: [rawIssue], total: 102 };
  }));
  assert.deepEqual(await c.columns(9), [{ name: "Doing", statusIds: ["2", "3"] }]);
  const page = await c.issues(9, "assignee = currentUser()", 50);
  assert.equal(page.next, 51); assert.equal(page.total, 102);
});
test("invalid configuration and keys cannot inject paths or credentials", () => {
  for (const url of ["http://example.test", "https://user:pass@example.test", "https://example.test?token=x", "https://example.test/#x"]) assert.throws(() => normalizeBaseUrl(url));
  for (const ids of ["1,../../x", "0", "-2", "1.2", "1e3"]) assert.throws(() => parseBoardIds(ids));
  assert.throws(() => keySchema.parse("APP-7/../../myself"));
  assert.throws(() => new JiraClient({ ...settings, pat: undefined }));
  assert.throws(() => new JiraClient({ ...settings, authMode: "cloud" }));
});
test("upstream error bodies and network errors never reveal the token", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const c = new JiraClient(settings, (async () => new Response("Bearer test-token-never-real", { status, headers: { "Retry-After": "0" } })) as typeof fetch);
    await assert.rejects(c.boards(), error => { assert.ok(error instanceof Error); assert.match(error.message, new RegExp(String(status))); assert.ok(!error.message.includes(settings.pat!)); return true; });
  }
  const c = new JiraClient(settings, (async () => { throw new Error("test-token-never-real"); }) as typeof fetch);
  await assert.rejects(c.boards(), /Cannot reach Jira/);
});
test("rate-limited reads are retried after Retry-After, writes never are", async () => {
  let reads = 0;
  const limited = new JiraClient(settings, (async () => ++reads < 3 ? new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }) : Response.json({ values: [], isLast: true })) as typeof fetch);
  assert.deepEqual(await limited.boards(), { boards: [], next: null });
  assert.equal(reads, 3);
  reads = 0;
  const always = new JiraClient(settings, (async () => { reads++; return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }); }) as typeof fetch);
  await assert.rejects(always.boards(), /HTTP 429/);
  assert.equal(reads, 3);
  let writes = 0;
  const write = new JiraClient(settings, (async () => { writes++; return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }); }) as typeof fetch);
  await assert.rejects(write.addComment("APP-7", "hi"), /HTTP 429/);
  assert.equal(writes, 1);
  const { retryDelay } = await import("../jira");
  assert.equal(retryDelay("3", 0), 3000);
  assert.equal(retryDelay("120", 0), 10_000);
  assert.equal(retryDelay(new Date(Date.now() - 5000).toUTCString(), 0), 0);
  assert.equal(retryDelay(null, 0), 1000); assert.equal(retryDelay(null, 1), 2000);
});
test("a cancelled request reports the cancellation, not a network problem", async () => {
  const controller = new AbortController();
  const c = new JiraClient(settings, (async (_input, init) => { controller.abort(new Error("Stopped by the user")); throw init?.signal?.reason; }) as typeof fetch);
  await assert.rejects(c.boards(0, controller.signal), /Stopped by the user/);
  const waiting = new AbortController();
  const limited = new JiraClient(settings, (async () => { setTimeout(() => waiting.abort(new Error("Turn ended")), 10); return new Response("slow down", { status: 429, headers: { "Retry-After": "5" } }); }) as typeof fetch);
  const started = Date.now();
  await assert.rejects(limited.boards(0, waiting.signal), /Turn ended/);
  assert.ok(Date.now() - started < 1000);
});
test("oversized and invalid JSON responses fail safely", async () => {
  const huge = new JiraClient(settings, (async () => new Response("x".repeat(8 * 1024 * 1024 + 1))) as typeof fetch);
  await assert.rejects(huge.boards(), /too large/);
  const html = new JiraClient(settings, (async () => new Response("<html>login</html>")) as typeof fetch);
  await assert.rejects(html.boards(), /invalid JSON/);
});

test("Cloud quick filters follow pagination and normalize IDs", async () => {
  const c = new JiraClient({ ...settings, authMode: "cloud", email: "user@example.test" }, fake(url => {
    assert.equal(url.pathname, "/jira/rest/agile/1.0/board/77/quickfilter");
    return url.searchParams.get("startAt") === "0"
      ? { values: [{ id: 10, name: "Mine", jql: "assignee = currentUser()" }], isLast: false }
      : { values: [{ id: 11, name: "Bugs", jql: "issuetype = Bug", description: "Only bugs" }], isLast: true };
  }));
  assert.deepEqual(await c.quickFilters(77), { available: true, filters: [
    { id: "10", name: "Mine", jql: "assignee = currentUser()", description: "" },
    { id: "11", name: "Bugs", jql: "issuetype = Bug", description: "Only bugs" },
  ] });
});

test("Server quick filters use GreenHopper only when the Agile endpoint is absent", async () => {
  const paths: string[] = [];
  const c = new JiraClient(settings, (async input => {
    const url = new URL(String(input)); paths.push(url.pathname);
    return url.pathname.includes("/agile/") ? new Response("Not found", { status: 404 }) : Response.json({ quickFilters: [{ id: 12, name: "Active", query: "resolution = Unresolved", description: null }] });
  }) as typeof fetch);
  assert.deepEqual((await c.quickFilters(77)).filters[0], { id: "12", name: "Active", jql: "resolution = Unresolved", description: "" });
  assert.deepEqual(paths, ["/jira/rest/agile/1.0/board/77/quickfilter", "/jira/rest/greenhopper/1.0/quickfilters/77"]);
  const unavailable = new JiraClient(settings, (async () => new Response("Not found", { status: 404 })) as typeof fetch);
  assert.deepEqual(await unavailable.quickFilters(77), { available: false, filters: [] });
  let requests = 0;
  const forbidden = new JiraClient(settings, (async () => { requests++; return new Response("No", { status: 403 }); }) as typeof fetch);
  await assert.rejects(forbidden.quickFilters(77), /HTTP 403/);
  assert.equal(requests, 1);
});

test("quick filter JQL preserves OR precedence and a manual ORDER BY", async () => {
  const { combineBoardFilters } = await import("../lib/board-filters");
  assert.equal(combineBoardFilters("", ["assignee = currentUser()"]), "(assignee = currentUser())");
  assert.equal(combineBoardFilters('summary ~ "ORDER BY" ORDER BY updated DESC', ["priority = High OR priority = Highest", "resolution = Unresolved"]), '(summary ~ "ORDER BY") AND (priority = High OR priority = Highest) AND (resolution = Unresolved) ORDER BY updated DESC');
  assert.equal(combineBoardFilters("ORDER BY updated DESC", ["issuetype = Bug"]), "(issuetype = Bug) ORDER BY updated DESC");
});

test("comments are posted as plain text on Server and as ADF on Cloud", async () => {
  const calls: { method?: string; path: string; contentType: string | null; body: any }[] = [];
  const handler = (url: URL, init?: RequestInit) => {
    calls.push({ method: init?.method, path: url.pathname, contentType: new Headers(init?.headers).get("Content-Type"), body: init?.body ? JSON.parse(String(init.body)) : null });
    return { id: 42, author: { displayName: "Sam" }, created: "now", body: init?.body ? JSON.parse(String(init.body)).body : "" };
  };
  const server = new JiraClient(settings, fake(handler));
  assert.deepEqual(await server.addComment("app-7", "привет"), { id: "42", author: "Sam", created: "now", body: "привет" });
  assert.deepEqual(calls[0], { method: "POST", path: "/jira/rest/api/2/issue/APP-7/comment", contentType: "application/json", body: { body: "привет" } });

  const cloud = new JiraClient({ ...settings, authMode: "cloud", email: "user@example.test" }, fake(handler));
  const created = await cloud.addComment("APP-7", "line one\nline two");
  assert.equal(calls[1].path, "/jira/rest/api/3/issue/APP-7/comment");
  assert.deepEqual(calls[1].body.body, { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "line one" }] }, { type: "paragraph", content: [{ type: "text", text: "line two" }] }] });
  assert.equal(created.body.includes("line one"), true);
  for (const body of ["", "   ", "x".repeat(32_768)]) await assert.rejects(server.addComment("APP-7", body));
});

test("transitions are listed and applied, with an optional comment and the resulting status", async () => {
  const seen: { method?: string; path: string; body: any }[] = [];
  const c = new JiraClient(settings, (async (input, init) => {
    const url = new URL(String(input)); const method = init?.method;
    seen.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname.endsWith("/transitions") && method === "POST") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/transitions")) return Response.json({ transitions: [{ id: "31", name: "Start progress", to: { id: "3", name: "In progress" } }] });
    assert.equal(url.searchParams.get("fields"), "status");
    return Response.json({ key: "APP-7", fields: { status: { id: "3", name: "In progress" } } });
  }) as typeof fetch);
  assert.deepEqual(await c.transitions("APP-7"), [{ id: "31", name: "Start progress", to: "In progress", toId: "3" }]);
  assert.deepEqual(await c.transition("APP-7", "31", "moving on"), { key: "APP-7", status: "In progress" });
  assert.deepEqual(seen[1], { method: "POST", path: "/jira/rest/api/2/issue/APP-7/transitions", body: { transition: { id: "31" }, update: { comment: [{ add: { body: "moving on" } }] } } });
  await c.transition("APP-7", "31");
  assert.deepEqual(seen[3].body, { transition: { id: "31" } });
  for (const id of ["", "../x", "31/../../myself", "x".repeat(80)]) await assert.rejects(c.transition("APP-7", id));
});

test("failed writes explain the change and never leak the token or Jira's body", async () => {
  const c = new JiraClient(settings, (async () => new Response("Bearer test-token-never-real", { status: 400 })) as typeof fetch);
  await assert.rejects(c.addComment("APP-7", "hi"), error => { assert.ok(error instanceof Error); assert.match(error.message, /rejected the change/); assert.ok(!error.message.includes(settings.pat!)); assert.ok(!error.message.includes("Bearer")); return true; });
  const forbidden = new JiraClient(settings, (async () => new Response("No", { status: 403 })) as typeof fetch);
  await assert.rejects(forbidden.transition("APP-7", "31"), /cannot change this issue/);
});

test("a transition that was applied still succeeds when the status readback fails", async () => {
  const c = new JiraClient(settings, (async (_input, init) => init?.method === "POST" ? new Response(null, { status: 204 }) : new Response("boom", { status: 500 })) as typeof fetch);
  assert.deepEqual(await c.transition("APP-7", "31"), { key: "APP-7", status: "Unknown" });
});

test("assign to me uses the token's account: accountId on Cloud, username on Server", async () => {
  const seen: { method?: string; path: string; body: any }[] = [];
  const handler = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method;
    seen.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname.endsWith("/myself")) return Response.json({ accountId: "acc-1", name: "sam", displayName: "Sam" });
    if (method === "PUT") return new Response(null, { status: 204 });
    assert.equal(url.searchParams.get("fields"), "assignee");
    return Response.json({ key: "APP-7", fields: { assignee: { displayName: "Sam" } } });
  }) as typeof fetch;
  const server = new JiraClient(settings, handler);
  assert.deepEqual(await server.assignToMe("app-7"), { key: "APP-7", assignee: "Sam" });
  assert.deepEqual(seen[1], { method: "PUT", path: "/jira/rest/api/2/issue/APP-7/assignee", body: { name: "sam" } });
  const cloud = new JiraClient({ ...settings, authMode: "cloud", email: "user@example.test" }, handler);
  await cloud.assignToMe("APP-7");
  assert.deepEqual(seen[4], { method: "PUT", path: "/jira/rest/api/3/issue/APP-7/assignee", body: { accountId: "acc-1" } });
  await assert.rejects(server.assignToMe("APP-7/../../myself"));
  const anonymous = new JiraClient(settings, (async () => Response.json({})) as typeof fetch);
  await assert.rejects(anonymous.assignToMe("APP-7"), /account ID/);
  const forbidden = new JiraClient(settings, (async (input: RequestInfo | URL) => String(input).endsWith("/myself") ? Response.json({ name: "sam" }) : new Response("No", { status: 403 })) as typeof fetch);
  await assert.rejects(forbidden.assignToMe("APP-7"), /cannot change this issue/);
});

test("related issues come back in one list with status and assignee, from one read and one search", async () => {
  const requests: URL[] = [];
  const c = new JiraClient(settings, (async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); requests.push(url);
    if (url.pathname.endsWith("/search")) return Response.json({ issues: [
      { key: "APP-1", fields: { summary: "Epic", status: { name: "In progress" }, assignee: { displayName: "Lee" }, issuetype: { name: "Epic" } } },
      { key: "APP-6", fields: { summary: "Dependency", status: { name: "Done" }, assignee: { displayName: "Sam" }, issuetype: { name: "Task" } } },
    ] });
    return Response.json({ key: "APP-7", fields: {
      parent: { key: "APP-1", fields: { summary: "Epic", status: { name: "In progress" }, issuetype: { name: "Epic" } } },
      issuelinks: [{ type: { inward: "is blocked by" }, inwardIssue: { key: "APP-6", fields: { summary: "Dependency", status: { name: "Done" } } } }, { type: { outward: "relates to" } }],
      subtasks: [{ key: "APP-8", fields: { summary: "Hidden subtask", status: { name: "To do" }, issuetype: { name: "Sub-task" } } }],
    } });
  }) as typeof fetch);
  assert.deepEqual(await c.related("app-7"), { key: "APP-7", truncated: false, related: [
    { relation: "parent", key: "APP-1", summary: "Epic", status: "In progress", assignee: "Lee", type: "Epic" },
    { relation: "is blocked by", key: "APP-6", summary: "Dependency", status: "Done", assignee: "Sam", type: "Task" },
    { relation: "subtask", key: "APP-8", summary: "Hidden subtask", status: "To do", assignee: "Unknown", type: "Sub-task" },
  ] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("fields"), "parent,issuelinks,subtasks");
  assert.equal(requests[1].searchParams.get("jql"), "key in (APP-1,APP-6,APP-8)");
  assert.equal(requests[1].searchParams.get("validateQuery"), "warn");

  // A failed assignee search still returns what the issue itself says about its relatives.
  const offline = new JiraClient(settings, (async (input: RequestInfo | URL) => String(input).includes("/search") ? new Response("boom", { status: 500 }) : Response.json({ key: "APP-7", fields: { subtasks: [{ key: "APP-8", fields: { summary: "Sub", status: { name: "To do" } } }] } })) as typeof fetch);
  assert.deepEqual((await offline.related("APP-7")).related, [{ relation: "subtask", key: "APP-8", summary: "Sub", status: "To do", assignee: "Unknown", type: "" }]);
  // No relatives: no search at all.
  let calls = 0;
  const lonely = new JiraClient(settings, (async () => { calls++; return Response.json({ key: "APP-7", fields: {} }); }) as typeof fetch);
  assert.deepEqual(await lonely.related("APP-7"), { key: "APP-7", related: [], truncated: false });
  assert.equal(calls, 1);
});

test("text attachments are read in chunks with a size cap; binary ones stay metadata", async () => {
  const requests: URL[] = [];
  const files: Record<string, { meta: object; body: string | Uint8Array<ArrayBuffer> }> = {
    "10": { meta: { id: "10", filename: "server.log", mimeType: "application/octet-stream", size: 50_000 }, body: "x".repeat(50_000) },
    "11": { meta: { id: "11", filename: "shot.png", mimeType: "image/png", size: 3 }, body: "png" },
    "12": { meta: { id: "12", filename: "payload.json", mimeType: "application/json", size: 2_000_000 }, body: "{\"a\":1}".padEnd(2_000_000, " ") },
    "13": { meta: { id: "13", filename: "data.txt", mimeType: "text/plain", size: 3 }, body: new Uint8Array([97, 0, 98]) },
  };
  const handler = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); requests.push(url);
    const id = url.pathname.match(/(?:attachment|content)\/(\d+)/)?.[1] ?? "";
    if (/\/rest\/api\/\d\/attachment\/\d+$/.test(url.pathname)) return Response.json(files[id].meta);
    return new Response(files[id].body);
  }) as typeof fetch;
  const server = new JiraClient(settings, handler);
  const log = await server.attachment("10");
  assert.deepEqual({ ...log, text: log.text?.length }, { id: "10", filename: "server.log", mimeType: "application/octet-stream", size: 50_000, text: 40_000, offset: 0, next: 40_000, note: "" });
  assert.equal(requests[1].pathname, "/jira/secure/attachment/10/server.log");
  const rest = await server.attachment("10", 40_000);
  assert.deepEqual([rest.text?.length, rest.next], [10_000, null]);

  const before = requests.length;
  assert.deepEqual(await server.attachment("11"), { id: "11", filename: "shot.png", mimeType: "image/png", size: 3, text: null, offset: 0, next: null, note: "Binary attachment: only its metadata can be read." });
  assert.equal(requests.length, before + 1, "a binary attachment is never downloaded");
  assert.equal((await server.attachment("13")).text, null);

  const cloud = new JiraClient({ ...settings, authMode: "cloud", email: "user@example.test" }, handler);
  const big = await cloud.attachment("12", 1_048_000);
  assert.equal(requests.at(-1)!.pathname, "/jira/rest/api/3/attachment/content/12");
  assert.equal(requests.at(-1)!.searchParams.get("redirect"), "false");
  assert.deepEqual([big.offset, big.text?.length, big.next], [1_048_000, 576, null]);
  assert.match(big.note, /first 1 MiB of 2000000 bytes/);
  for (const id of ["", "../1", "1/../../myself", "abc"]) await assert.rejects(server.attachment(id));
});

test("text attachments are recognised by MIME type, or by extension for generic types", async () => {
  const { isTextAttachment } = await import("../jira");
  for (const [mime, name] of [["text/plain", "a"], ["application/json; charset=utf-8", "a"], ["application/vnd.api+json", "a"], ["application/xml", "a"], ["application/octet-stream", "trace.LOG"], ["", "dump.har"]]) assert.equal(isTextAttachment(mime, name), true, `${mime} ${name}`);
  for (const [mime, name] of [["image/png", "a.png"], ["application/pdf", "a.txt"], ["application/zip", "logs.zip"], ["application/octet-stream", "core.bin"]]) assert.equal(isTextAttachment(mime, name), false, `${mime} ${name}`);
});

test("board issues carry the epic or parent and the priority ID for swimlanes", async () => {
  const fields: string[] = [];
  const c = new JiraClient(settings, fake(url => {
    fields.push(url.searchParams.get("fields") ?? "");
    return { total: 3, issues: [
      { key: "APP-1", fields: { summary: "Story", priority: { id: "2", name: "High" }, epic: { key: "APP-100", name: "Checkout", summary: "Checkout revamp" }, parent: { key: "APP-200", fields: { summary: "Ignored" } } } },
      { key: "APP-2", fields: { summary: "Sub-task", parent: { key: "APP-1", fields: { summary: "Story" } } } },
      { key: "APP-3", fields: { summary: "Loose" } },
    ] };
  }));
  const [story, subtask, loose] = (await c.issues(9, "", 0)).issues;
  assert.equal(fields[0], "summary,status,assignee,priority,issuetype,parent,epic");
  assert.deepEqual([story.parentKey, story.parentSummary, story.priorityId], ["APP-100", "Checkout revamp", "2"]);
  assert.deepEqual([subtask.parentKey, subtask.parentSummary, subtask.priorityId], ["APP-1", "Story", undefined]);
  assert.equal("parentKey" in loose, false);
});
