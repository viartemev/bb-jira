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
    const c = new JiraClient(settings, (async () => new Response("Bearer test-token-never-real", { status })) as typeof fetch);
    await assert.rejects(c.boards(), error => { assert.ok(error instanceof Error); assert.match(error.message, new RegExp(String(status))); assert.ok(!error.message.includes(settings.pat!)); return true; });
  }
  const c = new JiraClient(settings, (async () => { throw new Error("test-token-never-real"); }) as typeof fetch);
  await assert.rejects(c.boards(), /Cannot reach Jira/);
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
