import { useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc, useComposer, useBbNavigate, useRealtime, experimental_promptMentionClipboardAttributes } from "@get-bb/plugin-sdk/app";
import type { DragEvent, } from "react";
import type { rpcContract } from "./server";
import type { Detail, Issue, QuickFilter, Transition } from "./jira";
import { combineBoardFilters } from "./lib/board-filters";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { mountIssueDrops, issueDragType } from "./issue-drag";
import { CredentialStatus } from "./settings";

type Board = { id: number; name: string; type: string };
type Column = { name: string; statusIds: string[] };
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

export function dragIssue(event: DragEvent, issue: Issue) {
  const pill = document.createElement("span");
  const text = `@${issue.key}`;
  const attributes = experimental_promptMentionClipboardAttributes({ kind: "plugin", pluginId: "jira-boards", provider: "issue", id: issue.key, label: issue.key }, text);
  for (const [name, value] of Object.entries(attributes)) pill.setAttribute(name, value);
  pill.textContent = text;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(issueDragType, issue.key);
  event.dataTransfer.setData("text/html", pill.outerHTML);
  event.dataTransfer.setData("text/plain", text);
}

export function JiraPanel({ compact = false }: { compact?: boolean }) {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const navigate = useBbNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardNext, setBoardNext] = useState<number | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [jql, setJql] = useState("");
  const [filter, setFilter] = useState("");
  const [quickFilters, setQuickFilters] = useState<{ boardId: number; items: QuickFilter[] } | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<{ boardId: number; ids: string[] } | null>(null);
  const [filterWarning, setFilterWarning] = useState("");
  const visibleFilters = quickFilters?.boardId === boardId ? quickFilters.items : [];
  const selectedIds = selectedFilters?.boardId === boardId ? selectedFilters.ids : [];
  const effectiveJql = combineBoardFilters(filter, visibleFilters.filter(f => selectedIds.includes(f.id)).map(f => f.jql));
  const [key, setKey] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [transitions, setTransitions] = useState<{ key: string; items: Transition[] } | null>(null);
  const [transitionId, setTransitionId] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [refreshId, setRefreshId] = useState(0);
  useRealtime("boards-refresh-requested", () => { void loadBoards(); setRefreshId(id => id + 1); });
  useRealtime("credential-status-changed", () => { void loadBoards(); setRefreshId(id => id + 1); });
  const boardGeneration = useRef(0);
  const detailGeneration = useRef(0);

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
    let active = true;
    setFilterWarning("");
    if (!boardId) return;
    const selectedBoard = boardId;
    void rpc.call("quick_filters", { boardId: selectedBoard }).then(result => {
      if (!active) return;
      setQuickFilters({ boardId: selectedBoard, items: result.filters });
      if (!result.available) setFilterWarning("This Jira does not expose board quick filters. You can still use JQL.");
    }, () => { if (active) setFilterWarning("Could not load board quick filters. You can still use JQL; refresh to retry."); });
    return () => { active = false; };
  }, [rpc, boardId, refreshId]);
  useEffect(() => {
    const generation = ++boardGeneration.current;
    setIssues([]); setColumns([]); setTotal(0);
    if (!boardId) return;
    setBusy(true); setError("");
    const selectedBoard = boardId;
    const active = () => generation === boardGeneration.current;
    void (async () => {
      try {
        const [cols, first] = await Promise.all([rpc.call("columns", { boardId: selectedBoard }), rpc.call("issues", { boardId: selectedBoard, jql: effectiveJql, startAt: 0 })]);
        if (!active()) return;
        setColumns(cols);
        let page = first;
        const collected = new Map<string, Issue>();
        while (active()) {
          for (const issue of page.issues) collected.set(issue.key, issue);
          setIssues([...collected.values()]); setTotal(page.total);
          if (page.next === null) break;
          if (page.next <= page.startAt) throw new Error("Jira returned a non-advancing task page. Refresh the board to retry.");
          page = await rpc.call("issues", { boardId: selectedBoard, jql: effectiveJql, startAt: page.next });
        }
      } catch (e) { if (active()) setError(message(e)); }
      finally { if (active()) setBusy(false); }
    })();
    return () => { boardGeneration.current++; };
  }, [rpc, boardId, effectiveJql, refreshId]);
  async function openIssue(issueKey: string) {
    const generation = ++detailGeneration.current;
    setLoadingDetail(true); setDetail(null); setError(""); setNotice(""); setWriteError("");
    setCommentDraft(""); setTransitions(null); setTransitionId("");
    try {
      // Accept a Jira browse URL as well as a key; all network requests still go
      // exclusively to the configured Jira server.
      const match = issueKey.trim().match(/(?:^|\/browse\/)([A-Za-z][A-Za-z0-9_]*-\d+)(?:[?#].*)?$/);
      const d = await rpc.call("issue", { key: match?.[1] ?? issueKey.trim() });
      if (generation !== detailGeneration.current) return;
      setDetail(d);
      try {
        const items = await rpc.call("transitions", { key: d.issue.key });
        if (generation !== detailGeneration.current) return;
        setTransitions({ key: d.issue.key, items });
        setTransitionId(items[0]?.id ?? "");
      } catch {
        // Workflow transitions need extra permissions on some setups; the issue itself still opens.
        if (generation === detailGeneration.current) setTransitions({ key: d.issue.key, items: [] });
      }
    } catch (e) { if (generation === detailGeneration.current) setError(message(e)); }
    finally { if (generation === detailGeneration.current) setLoadingDetail(false); }
  }
  const availableTransitions = transitions && detail && transitions.key === detail.issue.key ? transitions.items : [];
  async function postComment(issueKey: string) {
    const body = commentDraft.trim();
    if (!body || writing) return;
    setWriting(true); setWriteError("");
    try {
      await rpc.call("add_comment", { key: issueKey, body });
      setRefreshId(id => id + 1);
      await openIssue(issueKey);
      setNotice(`${issueKey}: comment added.`);
    } catch (e) { setWriteError(message(e)); }
    finally { setWriting(false); }
  }
  async function moveIssue(issueKey: string) {
    if (!transitionId || writing) return;
    setWriting(true); setWriteError("");
    try {
      const result = await rpc.call("transition", { key: issueKey, transitionId });
      setRefreshId(id => id + 1);
      await openIssue(issueKey);
      setNotice(`${issueKey}: status is now ${result.status}.`);
    } catch (e) { setWriteError(message(e)); }
    finally { setWriting(false); }
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
  const columnKeys = grouped.map(column => new Set(column.items.map(issue => issue.key)));
  const people = new Map<string, { id: string; name: string; items: Issue[] }>();
  for (const issue of issues) {
    const id = issue.assigneeId ?? issue.assignee;
    if (!people.has(id)) people.set(id, { id, name: issue.assignee, items: [] });
    people.get(id)!.items.push(issue);
  }
  const lanes = [...people.values()].sort((a, b) => a.name === "Unassigned" ? 1 : b.name === "Unassigned" ? -1 : a.name.localeCompare(b.name));
  const gridStyle = { gridTemplateColumns: `repeat(${grouped.length}, minmax(256px, 1fr))` };
  return <div className={`flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-background text-foreground ${compact ? "p-2" : "p-4"}`}>
    <div aria-label="Board controls" className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.7fr)_2rem] gap-2">
      <label className="sr-only" htmlFor="jira-board">Board</label>
      <select id="jira-board" className="h-8 min-w-0 rounded-md border border-input bg-transparent px-2 text-xs" value={boardId ?? ""} onChange={e => setBoardId(Number(e.target.value))}>
        {!boards.length && <option value="">No boards</option>}
        {boards.map(b => <option key={b.id} value={b.id}>{b.name} · {b.id}</option>)}
      </select>
      <form className="relative min-w-0" onSubmit={e => { e.preventDefault(); setFilter(jql); }}>
        <Input className="h-8 min-w-0 pl-2 pr-7 text-xs" aria-label="Filter board using JQL" placeholder="JQL filter" value={jql} onChange={e => setJql(e.target.value)} maxLength={4000}/>
        <button className="absolute inset-y-0 right-0 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40" title="Apply JQL filter (Enter)" aria-label="Filter" type="submit" disabled={busy}>↵</button>
      </form>
      <form className="relative min-w-0" onSubmit={e => { e.preventDefault(); void openIssue(key); }}>
        <Input className="h-8 min-w-0 pl-2 pr-7 text-xs" aria-label="Issue key or Jira link" placeholder="Issue key" value={key} onChange={e => setKey(e.target.value)}/>
        <button className="absolute inset-y-0 right-0 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40" title="Open issue (Enter)" aria-label="Open issue" type="submit" disabled={!key.trim() || loadingDetail}>↵</button>
      </form>
      <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label="Refresh board" title="Refresh board" disabled={busy || !boardId} onClick={() => setRefreshId(id => id + 1)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1.6L20 8M4 16l2.4 2.6A7 7 0 0 0 17.9 17"/></svg>
      </button>
    </div>
    {boardNext !== null && <Button className="shrink-0 self-start" size="sm" variant="ghost" disabled={busy} onClick={() => void loadBoards(boardNext)}>More boards</Button>}
    {visibleFilters.length > 0 && <div aria-label="Board quick filters" className="flex shrink-0 gap-1 overflow-x-auto pb-1">
      {visibleFilters.map(f => <button key={f.id} type="button" aria-pressed={selectedIds.includes(f.id)} title={f.description || f.jql} className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground" onClick={() => setSelectedFilters({ boardId: boardId!, ids: selectedIds.includes(f.id) ? selectedIds.filter(id => id !== f.id) : [...selectedIds, f.id] })}>{f.name}</button>)}
      {selectedIds.length > 0 && <button className="shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedFilters({ boardId: boardId!, ids: [] })}>Clear filters</button>}
    </div>}
    {filterWarning && <p className="text-xs text-muted-foreground">{filterWarning}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loadingDetail && <p role="status">Loading issue…</p>}
    {detail && <section aria-label={detail.issue.key} className="max-h-[45%] shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-4 space-y-3">
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
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="jira-transition">Move issue to another status</label>
          <select id="jira-transition" aria-label="Move issue to another status" className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs disabled:opacity-40" value={transitionId} onChange={e => setTransitionId(e.target.value)} disabled={writing || !availableTransitions.length}>
            {!availableTransitions.length && <option value="">{transitions?.key === detail.issue.key ? "No transitions available" : "Loading transitions…"}</option>}
            {availableTransitions.map(t => <option key={t.id} value={t.id}>{t.name}{t.to ? ` → ${t.to}` : ""}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={writing || !transitionId} onClick={() => void moveIssue(detail.issue.key)}>Move</Button>
        </div>
        <label className="sr-only" htmlFor="jira-comment">Write a comment</label>
        <textarea id="jira-comment" aria-label="Write a comment" className="min-h-16 w-full resize-y rounded-md border border-input bg-transparent p-2 text-sm" placeholder="Write a comment…" maxLength={32767} value={commentDraft} onChange={e => setCommentDraft(e.target.value)} disabled={writing}/>
        <div className="flex justify-end">
          <Button size="sm" disabled={writing || !commentDraft.trim()} onClick={() => void postComment(detail.issue.key)}>{writing ? "Saving…" : "Comment"}</Button>
        </div>
        {writeError && <p role="alert" className="text-sm text-destructive">{writeError}</p>}
      </div>
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
    {!busy && !boards.length && !error && <p className="text-sm text-muted-foreground">No accessible boards. Configure Jira in Settings → Plugins → Jira Boards.</p>}
    {boardId && <>
      <div aria-label="Kanban board" className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <div style={{ minWidth: `${grouped.length * 272}px` }}>
          <div className="sticky top-0 z-10 grid border-b border-border bg-background" style={gridStyle}>
            {grouped.map((c, idx) => <h2 key={idx} className="flex items-center justify-between gap-2 border-r border-border px-3 py-2.5 text-xs font-semibold last:border-r-0"><span className="truncate">{c.name}</span><span className="rounded-full bg-muted px-2 py-0.5 tabular-nums text-muted-foreground">{c.items.length}</span></h2>)}
          </div>
          {lanes.map(person => <details key={person.id} open className="border-b border-border last:border-b-0" aria-label={`Assignee: ${person.name}`}>
            <summary className="cursor-pointer bg-muted/50 px-3 py-2 text-xs font-semibold"><span className="sticky left-3 inline-flex gap-2"><span>{person.name}</span><span className="font-normal tabular-nums text-muted-foreground">{person.items.length}</span></span></summary>
            <div className="grid" style={gridStyle}>
              {grouped.map((c, idx) => <section key={idx} aria-label={`${person.name}: ${c.name}`} className="min-h-24 space-y-2 border-r border-border bg-muted/20 p-2 last:border-r-0">
                {person.items.filter(i => columnKeys[idx].has(i.key)).map(i => <article key={i.key} draggable onDragStart={event => dragIssue(event, i)} title="Drag into the message box" className="cursor-grab space-y-2 rounded-md border border-border bg-card p-3 shadow-sm active:cursor-grabbing">
                  <button className="w-full space-y-1 text-left text-sm" onClick={() => void openIssue(i.key)}>
                    <span className="block text-xs text-muted-foreground">{i.key} · {i.type}</span><span className="block font-medium">{i.summary}</span>
                    <span className="block text-xs text-muted-foreground">{i.status} · {i.priority}</span>
                  </button>
                  <Button size="sm" variant="outline" onClick={() => addToChat(i)}>Add to chat</Button>
                </article>)}
              </section>)}
            </div>
          </details>)}
          {!busy && !issues.length && <p className="p-8 text-center text-sm text-muted-foreground">No tasks match this board and filter.</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{issues.length} of {total} tasks</span>
        <span>{busy ? "Loading all tasks…" : "Grouped by assignee"}</span>
      </div>
    </>}
  </div>;
}

export function JiraSidePanel() {
  return <JiraPanel compact />;
}

export default definePluginApp(app => {
  app.contentScripts.register({ id: "issue-drops", mount: mountIssueDrops });
  app.slots.settingsSection({ id: "connection", title: "Connection status", component: CredentialStatus });
  app.slots.experimental_tab({ id: "jira", title: "Jira", icon: "jira-boards/mark", context: { kind: "thread" }, availability: "action", layout: "flush", component: JiraSidePanel });
  app.slots.experimental_newThreadPanelAction({ id: "jira", title: "Jira", icon: "jira-boards/mark", layout: "flush", component: JiraSidePanel });
  app.slots.experimental_threadAction({ id: "jira", title: "Jira", icon: "jira-boards/mark", group: "jira", placement: "header",
    item: ({ experimental_panel }) => ({ label: "Jira", icon: "jira-boards/mark", run: () => { experimental_panel.toggleTab({ tab: { id: "jira", context: { kind: "thread" }, availability: "action" }, title: "Jira" }); } }),
  });
});
