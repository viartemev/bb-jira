<div align="center">

# Jira for BB

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
- **A familiar Kanban board.** Horizontal status columns, fixed headings, issue counts, and independent scrolling. More tasks load as you scroll.
- **A compact toolbar.** Choose a board, apply a JQL filter, open an issue by key or URL, and refresh the board in one row.
- **Drag a ticket into chat.** Drop a card anywhere inside the message input, or use **Add to chat**. Your existing draft stays intact.
- **Fresh context when you send.** A Jira mention resolves into issue fields, description, comments, links, subtasks, and attachment metadata.
- **Tools for the next question.** Agents can retrieve individual fields, additional comment pages, and other issues through the plugin's tools and CLI.

Independent community plugin for [BB](https://getbb.app). Not affiliated with Atlassian.

## Install

Requires **BB 0.47+** and a reachable Jira Software instance. BB checks plugin and SDK compatibility during installation.

```sh
bb plugin install https://github.com/viartemev/bb-jira.git
```

BB downloads dependencies, builds the plugin, and enables it. To update an installation that tracks the default branch:

```sh
bb plugin update jira --yes
```

## Connect Jira

Open **Settings → Plugins → Jira**.

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

Scroll horizontally to see other status columns, or widen the panel. Scroll down a column to fetch more tasks. The footer shows **loaded / total** task counts; column counts describe the tasks currently loaded.

### Filter, find, refresh

The top toolbar keeps the controls together:

- **Board selector:** switch between the boards available to your account.
- **JQL filter:** enter a query and press **Enter** or click the small arrow.
- **Issue key:** enter `DEMO-104` or a Jira browse URL and press **Enter** to inspect it.
- **Refresh icon:** reload the selected board with the applied filter. This starts again from the first page; scrolling loads subsequent pages automatically.

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

| Tool | What it reads |
| --- | --- |
| `jira_issue(key, field?, offset?)` | Issue context, or an individual field in 40k-character chunks |
| `jira_comments(key, startAt?)` | Up to 50 comments with the next page offset |
| `jira_boards(startAt?)` | Configured boards or a page of accessible boards |
| `jira_board_issues(boardId, jql?, startAt?)` | Up to 50 board issues, optionally filtered with JQL |

A bundled [Jira skill](skills/jira/SKILL.md) teaches agents when to fetch context, follow pagination, and treat Jira content as reference data.

The same connection is available from the CLI:

```sh
bb jira issue DEMO-104
bb jira boards --start 0
bb jira --help
```

## Permissions and limits

The plugin **reads Jira only**. It does not change statuses, post comments, assign tickets, or modify boards. Dragging a card adds context to a message; it does not move the ticket between Jira statuses.

- Access follows the token's Jira account permissions. Board IDs filter the board picker; they are not an access-control boundary.
- Credentials stay on the BB server. Issue content is shared with your selected agent provider when you send a mention or use a Jira tool.
- Initial context includes all returned fields, the first 50 comments, links, subtasks, and attachment metadata. It is capped at 48k characters with an explicit truncation notice.
- Agents can request more field and comment pages. Individual comments are capped at 60k characters.
- Attachment contents, full issue history, and linked issues are not downloaded automatically. Descriptions and comments display as plain text, including converted Cloud ADF.
- Requests reject redirects, time out after 20 seconds, and cap upstream responses at 8 MiB. Error messages do not include upstream response bodies or credentials.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| HTTP 401 | Token validity, deployment selection, and Cloud account email |
| HTTP 403 or 404 | The account's permissions and whether the board or issue is visible in Jira |
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

GitHub Actions checks types and tests. Tests cover authentication, pagination, bounded context, input validation, native drag-and-drop handling, mention insertion, and connection settings using fixtures and BB's public SDK harness.

See [Contributing](CONTRIBUTING.md), [Changelog](CHANGELOG.md), and the [MIT license](LICENSE).
