import { useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc, useComposer, useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Detail, Issue } from "./jira";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

type Board = { id: number; name: string; type: string };
type Column = { name: string; statusIds: string[] };
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

export function JiraPanel() {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const navigate = useBbNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardNext, setBoardNext] = useState<number | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [jql, setJql] = useState("");
  const [filter, setFilter] = useState("");
  const [key, setKey] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const boardGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const loadingPage = useRef(false);

  async function loadBoards(startAt = 0) {
    setBusy(true); setError("");
    try {
      const d = await rpc.call("boards", { startAt });
      setBoards(old => startAt ? [...old, ...d.boards] : d.boards);
      setBoardNext(d.next);
      if (!startAt) setBoardId(old => old && d.boards.some(b => b.id === old) ? old : d.boards[0]?.id ?? null);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  useEffect(() => { void loadBoards(); }, [rpc]);
  useEffect(() => {
    const generation = ++boardGeneration.current;
    loadingPage.current = false;
    setIssues([]); setColumns([]); setNext(null); setTotal(0);
    if (!boardId) return;
    setBusy(true); setError("");
    Promise.all([rpc.call("columns", { boardId }), rpc.call("issues", { boardId, jql: filter, startAt: 0 })]).then(([cols, page]) => {
      if (generation !== boardGeneration.current) return;
      setColumns(cols); setIssues(page.issues); setNext(page.next); setTotal(page.total);
    }).catch(e => { if (generation === boardGeneration.current) setError(message(e)); })
      .finally(() => { if (generation === boardGeneration.current) setBusy(false); });
    return () => { boardGeneration.current++; };
  }, [rpc, boardId, filter]);
  async function moreIssues() {
    if (!boardId || next === null || loadingPage.current) return;
    const generation = boardGeneration.current;
    loadingPage.current = true; setBusy(true); setError("");
    try {
      const page = await rpc.call("issues", { boardId, jql: filter, startAt: next });
      if (generation !== boardGeneration.current) return;
      setIssues(old => [...new Map([...old, ...page.issues].map(i => [i.key, i])).values()]); setNext(page.next); setTotal(page.total);
    } catch (e) { if (generation === boardGeneration.current) setError(message(e)); }
    finally { if (generation === boardGeneration.current) { setBusy(false); loadingPage.current = false; } }
  }
  async function openIssue(issueKey: string) {
    const generation = ++detailGeneration.current;
    setLoadingDetail(true); setDetail(null); setError(""); setNotice("");
    try {
      // Accept a Jira browse URL as well as a key; all network requests still go
      // exclusively to the configured Jira server.
      const match = issueKey.trim().match(/(?:^|\/browse\/)([A-Za-z][A-Za-z0-9_]*-\d+)(?:[?#].*)?$/);
      const d = await rpc.call("issue", { key: match?.[1] ?? issueKey.trim() });
      if (generation === detailGeneration.current) setDetail(d);
    } catch (e) { if (generation === detailGeneration.current) setError(message(e)); }
    finally { if (generation === detailGeneration.current) setLoadingDetail(false); }
  }
  function addToChat(issue: Issue) {
    composer.insert([{ provider: "issue", id: issue.key, label: issue.key }], { at: "end", block: true });
    if (composer.scope.kind === "new-thread") navigate.toCompose({ focusPrompt: true });
    composer.focus(); setNotice(`${issue.key} added to the message draft. Its current context will be loaded when you send.`);
  }
  function newChat(issue: Issue) {
    navigate.toCompose({ initialPrompt: `Read Jira issue ${issue.key} (${issue.url}) with jira_issue and help me work on it.`, focusPrompt: true });
  }
  const grouped = columns.map(c => ({ ...c, items: issues.filter(i => c.statusIds.includes(i.statusId)) }));
  const unmapped = issues.filter(i => !columns.some(c => c.statusIds.includes(i.statusId)));
  if (unmapped.length || !grouped.length) grouped.push({ name: columns.length ? "Other statuses" : "Issues", statusIds: [], items: unmapped });
  return <div className="h-full overflow-auto bg-background text-foreground p-4 space-y-4">
    <div className="flex flex-wrap gap-2 items-center">
      <label className="text-sm" htmlFor="jira-board">Board</label>
      <select id="jira-board" className="rounded-md border border-border bg-background p-2 text-sm max-w-full" value={boardId ?? ""} onChange={e => setBoardId(Number(e.target.value))}>
        {!boards.length && <option value="">No boards loaded</option>}
        {boards.map(b => <option key={b.id} value={b.id}>{b.name} · {b.id}</option>)}
      </select>
      <Button variant="outline" disabled={busy} onClick={() => { void loadBoards(); setBoardId(null); }}>Refresh</Button>
      {boardNext !== null && <Button variant="outline" disabled={busy} onClick={() => void loadBoards(boardNext)}>More boards</Button>}
      <Button variant="outline" onClick={async () => { try { const r = await rpc.call("connection"); setNotice(`Connected as ${r.displayName}`); setError(""); } catch (e) { setError(message(e)); } }}>Test connection</Button>
    </div>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setFilter(jql); }}>
      <Input aria-label="Filter board using JQL" placeholder='JQL filter, e.g. assignee = currentUser()' value={jql} onChange={e => setJql(e.target.value)} maxLength={4000}/>
      <Button type="submit" disabled={busy}>Filter</Button>
    </form>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void openIssue(key); }}>
      <Input aria-label="Issue key or Jira link" placeholder="Issue key or Jira link" value={key} onChange={e => setKey(e.target.value)}/>
      <Button type="submit" disabled={!key.trim() || loadingDetail}>Open issue</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loadingDetail && <p role="status">Loading issue…</p>}
    {detail && <section aria-label={detail.issue.key} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a className="underline text-sm" href={detail.issue.url} target="_blank" rel="noreferrer">{detail.issue.key} ↗</a>
        <span className="text-xs text-muted-foreground">{detail.issue.status} · {detail.issue.assignee} · {detail.issue.priority}</span>
        <Button variant="ghost" size="sm" onClick={() => { detailGeneration.current++; setDetail(null); }}>Close</Button>
      </div>
      <h2 className="font-semibold">{detail.issue.summary}</h2>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => addToChat(detail.issue)}>Add to chat</Button>
        <Button variant="outline" onClick={() => newChat(detail.issue)}>New chat</Button>
      </div>
      <p className="whitespace-pre-wrap text-sm">{detail.description || "No description."}</p>
      <details><summary className="cursor-pointer text-sm">Comments ({detail.comments.length} of {detail.commentsTotal})</summary>
        {detail.comments.map(c => <article key={c.id} className="border-t border-border py-3 text-sm"><p className="text-muted-foreground">{c.author} · {c.created}</p><p className="whitespace-pre-wrap">{c.body}</p></article>)}
        {detail.comments.length < detail.commentsTotal && <p className="text-sm text-muted-foreground">The agent can read more with jira_comments.</p>}
      </details>
      <details><summary className="cursor-pointer text-sm">Links, subtasks and attachments</summary>
        {detail.links.map((l, i) => <p key={i} className="text-sm">{l.relation}: {l.key} {l.summary}</p>)}
        {detail.subtasks.map(s => <button key={s.key} className="block text-sm underline" onClick={() => void openIssue(s.key)}>{s.key} {s.summary}</button>)}
        {detail.attachments.map(a => <p key={a.id} className="text-sm">{a.filename} · {a.size} bytes (metadata only)</p>)}
      </details>
      <details><summary className="cursor-pointer text-sm">All fields</summary><pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(detail.fields, null, 2)}</pre></details>
    </section>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Loading board…</p>}
    {!busy && !boards.length && !error && <p className="text-sm text-muted-foreground">No accessible boards. Configure Jira in Settings → Plugins → Jira, then refresh.</p>}
    {boardId && <>
      <p className="text-xs text-muted-foreground">Loaded {issues.length} of {total} issues. Add a ticket to your draft or mention it with @ in chat.</p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {grouped.map((c, idx) => <section key={idx} className="min-w-64 w-72 shrink-0 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <h2 className="text-sm font-medium">{c.name} <span className="text-muted-foreground">{c.items.length}</span></h2>
          {c.items.map(i => <article key={i.key} className="rounded-md border border-border bg-card p-3 space-y-2">
            <button className="text-left w-full text-sm space-y-1" onClick={() => void openIssue(i.key)}>
              <span className="block text-xs text-muted-foreground">{i.key} · {i.type}</span><span className="block font-medium">{i.summary}</span>
              <span className="block text-xs text-muted-foreground">{i.assignee} · {i.status}</span>
            </button>
            <Button size="sm" variant="outline" onClick={() => addToChat(i)}>Add to chat</Button>
          </article>)}
          {!c.items.length && <p className="text-xs text-muted-foreground">No loaded issues</p>}
        </section>)}
      </div>
      {next !== null && <Button variant="outline" disabled={busy} onClick={() => void moreIssues()}>Load more issues</Button>}
    </>}
    <p className="text-xs text-muted-foreground">Jira · read-only · credentials stay on the BB server</p>
  </div>;
}

export default definePluginApp(app => {
  app.slots.navPanel({ id: "boards", title: "Jira", icon: "PanelsTopLeft", path: "boards", component: JiraPanel });
  app.slots.experimental_tab({ id: "jira", title: "Jira", icon: "PanelsTopLeft", context: { kind: "thread" }, availability: "action", component: JiraPanel });
  app.slots.experimental_newThreadPanelAction({ id: "jira", title: "Jira", icon: "PanelsTopLeft", component: JiraPanel });
});
