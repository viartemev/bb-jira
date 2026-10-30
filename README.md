<div align="center">

# Jira Boards for BB

**English** · [Русский](README.ru.md)

**Your Jira board. Your conversation. One workspace.**

Browse a Kanban board beside your chat, drag in a ticket, and give your agent the context to get started.

[![CI](https://github.com/viartemev/bb-jira/actions/workflows/ci.yml/badge.svg)](https://github.com/viartemev/bb-jira/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/viartemev/bb-jira)](https://github.com/viartemev/bb-jira/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Install](#install) · [Connect Jira](#connect-jira) · [Use it](#use-it) · [Agent tools](#agent-tools) · [Troubleshooting](#troubleshooting)

</div>

![Jira Kanban board beside a BB conversation, with a ticket added to the message draft](docs/screenshots/board-and-chat.jpg)

*Captured from the running plugin with fictional demonstration data. Screenshots show the current default branch; tagged releases may have an earlier interface.*

## Bring the board into the conversation

- **A real side panel.** Jira opens as a full-height tab alongside Browser and Terminal. Your conversation stays visible.
- **A familiar Kanban board.** Horizontal status columns, fixed headings, and collapsible swimlanes grouped by assignee. All task pages load automatically.
- **Board quick filters.** Use the quick filters already configured in Jira, combine several, or add your own JQL.
- **A compact toolbar.** Choose a board, apply a JQL filter, open an issue by key or URL, and refresh the board in one row.
- **Drag a ticket into chat.** Drop a card anywhere inside the message input, or use **Add to chat**. Your existing draft stays intact.
- **Fresh context when you send.** A Jira mention resolves into issue fields, description, comments, links, subtasks, and attachment metadata.
- **Write back when you mean to.** Post a comment or move a ticket through its workflow from the issue panel, or ask the agent to do it; Jira permissions and workflow rules still decide what succeeds.
- **Tools for the next question.** Agents can retrieve individual fields, additional comment pages, and other issues, and can comment or transition an issue when you ask them to.

Independent community plugin for [BB](https://getbb.app). Not affiliated with Atlassian.

## Install

Requires **BB 0.47+** and a reachable Jira Software instance. BB checks plugin and SDK compatibility during installation.

```sh
bb plugin install https://github.com/viartemev/bb-jira.git
```

BB downloads dependencies, builds the plugin, and enables it. To update an installation that tracks the default branch:

```sh
bb plugin update jira-boards --yes
```

The plugin installs as **Jira Boards** (`jira-boards`). Earlier versions were
published as `jira`; remove that installation (`bb plugin remove jira`) and
enter the Jira URL and token again after installing this one, because BB keeps
settings and secrets per plugin.

## Connect Jira

Open **Settings → Plugins → Jira Boards**.

| Setting | What to enter |
| --- | --- |
| **Jira deployment** | **Data Center / Server** or **Cloud** |
| **Jira URL** | Your HTTPS site URL, including any context path, such as `https://jira.example.com/jira` |
| **Personal access token / Cloud API token** | A token for your Jira account; BB stores it as a secret |
| **Atlassian account email** | Cloud only; the email belonging to the token's account |
| **Board IDs** | IDs separated by commas, such as `17, 42`; leave empty to browse accessible boards |

Board URLs contain the ID as `rapidView=17` or `/boards/17`.

Use **Test connection** in settings to check the saved credentials. **Refresh boards** reloads the boards and tasks in open Jira tabs. The status section tells you whether a token is already saved; a hidden or `[set]` value means you do not need to enter it again.

The BB server must be able to reach Jira over HTTPS, including any required VPN and trusted corporate TLS certificate. Never paste a token into a chat or a shell command.

<details>
<summary><strong>Authentication details</strong></summary>

- **Server / Data Center:** PAT mode sends `Authorization: Bearer`. Jira Software 8.14+ provides PAT support and the Agile APIs used by the plugin.
- **Cloud:** uses an Atlassian account email and a classic unscoped API token against the site's URL. Scoped tokens using the Atlassian gateway and OAuth are not implemented. Mention search uses `/rest/api/3/search/jql`.
- Switching the deployment updates the settings form while preserving saved values. The account email field appears only for Cloud.

The Server / Data Center workflow has been exercised against a live Jira instance. Cloud authentication and response handling have automated coverage with fixture responses.

</details>

## Use it

### Open the board

Open BB's side panel, choose **+ → Jira**, and select a board. Existing threads also have a **Jira** action in their header.

Scroll horizontally to see other status columns, or widen the panel. Each person has a collapsible swimlane with their tasks in the matching status columns. Tasks without an assignee have their own lane.

All pages load automatically, so active work on later pages is not hidden behind the first page of completed tasks. The footer shows **loaded / total** task counts and loading progress; counts are complete when loading finishes.

### Filter, find, refresh

The top toolbar keeps the controls together:

- **Board selector:** switch between the boards available to your account.
- **JQL filter:** enter a query and press **Enter** or click the small arrow.
- **Issue key:** enter `DEMO-104` or a Jira browse URL and press **Enter** to inspect it.
- **Refresh icon:** reload the selected board with the applied filter. This starts again from the first page and automatically continues through the remaining pages.

When the board exposes quick filters, their names appear as compact buttons beneath the toolbar. Click to toggle them; **Clear filters** resets the selection. Selected quick filters and manual JQL are combined with **AND**. If Jira does not expose these filters, the board and manual JQL remain available.

For example, show your unresolved work:

```jql
assignee = currentUser() AND resolution = Unresolved
```

### Give your agent a ticket

Drag a card from the board into the message input. The input highlights while it can accept the drop. A Jira mention appears in your draft; add your request and send when ready.

> Investigate this bug, explain the cause, and propose a fix.

**Add to chat** does the same without dragging, including on touch devices. You can also type **@** in the composer and search by issue key or text. **New chat** opens a new draft asking the agent to read the ticket.

![Issue details in the Jira side panel, including its description and comments](docs/screenshots/issue-details.jpg)

*Issue details from the same fictional demonstration board. Adding a ticket never sends a message automatically.*

## Agent tools

| Tool | What it does |
| --- | --- |
| `jira_issue(key, field?, offset?)` | Reads issue context, or an individual field in 40k-character chunks |
| `jira_comments(key, startAt?)` | Reads up to 50 comments with the next page offset |
| `jira_boards(startAt?)` | Lists configured boards or a page of accessible boards |
| `jira_board_issues(boardId, jql?, startAt?)` | Lists up to 50 board issues, optionally filtered with JQL |
| `jira_comment(key, body)` | Posts a comment as your Jira account |
| `jira_transitions(key)` | Lists the workflow transitions available on an issue |
| `jira_transition(key, transitionId, comment?)` | Applies one transition, optionally with a comment |

A bundled [Jira skill](skills/jira/SKILL.md) teaches agents when to fetch context, follow pagination, treat Jira content as reference data, and only write when you ask.

The same connection is available from the CLI:

```sh
bb jira issue DEMO-104
bb jira boards --start 0
bb jira comment DEMO-104 --body "Deployed to staging"
bb jira transitions DEMO-104
bb jira transition DEMO-104 --to 31 --comment "Ready for review"
bb jira --help
```

`--body` and `--comment` also accept `-stdin`, so `pbpaste | bb jira comment DEMO-104 --body-stdin` posts multi-line text without shell quoting.

## Permissions and limits

The plugin reads Jira and writes only two things: comments and workflow transitions. It never edits descriptions or fields, assigns tickets, or changes board configuration. Dragging a card adds context to a message; it does not move the ticket between Jira statuses.

Every write runs as your Jira account, with your permissions and workflow rules: a transition that requires a screen, a mandatory field, or a condition fails with Jira's HTTP status and changes nothing. Agents write only when you ask them to; the issue panel has explicit **Comment** and **Move** buttons.

- Access follows the token's Jira account permissions. Board IDs filter the board picker; they are not an access-control boundary.
- Credentials stay on the BB server. Issue content is shared with your selected agent provider when you send a mention or use a Jira tool.
- Initial context includes all returned fields, the first 50 comments, links, subtasks, and attachment metadata. It is capped at 48k characters with an explicit truncation notice.
- Agents can request more field and comment pages. Individual comments are capped at 60k characters.
- Attachment contents, full issue history, and linked issues are not downloaded automatically. Descriptions and comments display as plain text, including converted Cloud ADF.
- Requests reject redirects, time out after 20 seconds, and cap upstream responses at 8 MiB. Error messages do not include upstream response bodies or credentials.

## Roadmap

What a ticket can do today and what it cannot yet. A ticked box means the current version supports it; everything else is read-only, done by hand in the browser or through raw API calls.

### Reading

- [x] The whole issue: fields, description, comments, links, subtasks, attachment metadata
- [x] Custom fields and large fields in 40k-character chunks
- [x] Search: JQL, the @ menu, comment pages
- [ ] Issue history: who changed which field and moved which status
- [ ] Attachments: download and preview (metadata only today)
- [ ] "My work": assigned to me, overdue, recently opened, saved filters
- [ ] Sprint, epic, hierarchy and backlog

### Writing

- [x] Plain-text comment (plain text on Server/Data Center, ADF on Cloud)
- [x] Status change on a simple workflow
- [ ] Status change when the transition screen requires fields (resolution and others)
- [ ] Comment with markdown, code, lists and @mentions
- [ ] Edit and delete your own comment
- [ ] Assignee, "assign to me"
- [ ] Summary and description
- [ ] Priority, labels, components, fixVersion
- [ ] Due date, estimate, worklog
- [ ] Story points and moving issues between sprints
- [ ] Links: blocks, relates, duplicates
- [ ] Epic link, parent and subtask creation
- [ ] Create an issue
- [ ] Create subtasks from a checklist
- [ ] Attach files and screenshots
- [ ] Watch/unwatch and "mentioned me"
- [ ] Bulk operations over JQL

### Write safety

- [ ] Draft and confirmation before sending: writes run as your account
- [ ] A report of what exactly changed after a write (today only the new status comes back)

Deleting issues is not planned.

### Order of work

1. Transition screens and required fields — otherwise **Move** is unreliable.
2. Editing summary, description, priority, labels, due date and the assignee.
3. Creating issues and subtasks.
4. "My work" and saved filters.
5. Issue history and attachments.
6. Comments with markup, editing and deletion.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| HTTP 401 | Token validity, deployment selection, and Cloud account email |
| HTTP 403 or 404 | The account's permissions, whether the board or issue is visible in Jira, and whether the workflow allows that transition |
| Network or TLS error | The BB server's VPN, HTTPS URL, context path, and corporate certificate trust |
| No boards | Board IDs and Jira Software access; use **Refresh boards** in settings |
| Missing agent tools | Start a new agent session so BB can load the plugin's tools and skill |
| HTTP 429 | Wait before retrying; Jira is rate limiting requests |

[Report a bug](https://github.com/viartemev/bb-jira/issues/new) with your BB/Jira versions and a reproduction that excludes tokens and private issue data.

## Development

Use Node.js 24 and a compatible BB installation.

```sh
git clone https://github.com/viartemev/bb-jira.git
cd bb-jira
npm ci --include=dev
npm run typecheck
npm test
bb plugin build
```

GitHub Actions runs on every push to `main` and every pull request: type checking, the test suite, and a production dependency audit (`npm audit --omit=dev --audit-level=high`). Dependabot proposes weekly npm and Actions updates.

To publish a release, describe the changes under `## Unreleased` in `CHANGELOG.md` while you work, merge to `main`, then run:

```sh
npm run release -- 0.2.1
git push origin main v0.2.1
```

`npm run release` bumps `version` in `package.json`, dates the `Unreleased` section, commits, and tags `v0.2.1`; it never pushes. The pushed tag starts the Release workflow, which refuses a tag that differs from `package.json` or is not on `main`, reruns type checking and tests, takes the release notes from the matching changelog section (plus GitHub's generated notes), attaches a source archive, and creates the GitHub release. A version with a hyphen, such as `0.3.0-rc.1`, is marked as a pre-release.

The workflow summary also says whether the version is inside the marketplace range. Releases inside it reach users with `bb plugin update jira-boards --yes`; for one outside it (for example `0.3.0` against `^0.2.0`), open a pull request to [get-bb/marketplace](https://github.com/get-bb/marketplace) changing `source.git.range` in `entries/jira-boards.json`.

Tests cover authentication, pagination, bounded context, input validation, native drag-and-drop handling, mention insertion, and connection settings using fixtures and BB's public SDK harness.

See [Contributing](CONTRIBUTING.md), [Changelog](CHANGELOG.md), and the [MIT license](LICENSE).
