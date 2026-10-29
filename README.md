# Jira for BB

[![CI](https://github.com/viartemev/bb-jira/actions/workflows/ci.yml/badge.svg)](https://github.com/viartemev/bb-jira/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/viartemev/bb-jira)](https://github.com/viartemev/bb-jira/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Bring Jira boards and ticket context into [BB](https://getbb.app) conversations with coding agents.**

Browse your team's boards beside a chat, pick a ticket, and ask an agent to
investigate or implement it. The plugin fetches the issue through Jira's REST
API using your personal access token (PAT); the agent never needs the token.

An independent community plugin for BB. Not affiliated with Atlassian.

[Installation](#installation) · [Setup](#setup) · [Usage](#usage) · [Agent tools](#agent-tools) · [Limitations](#limitations) · [Contributing](CONTRIBUTING.md)

## What you get

- **Boards alongside chat:** a full-height Jira tab in BB’s side panel, next to Browser and Terminal,
  with configured board columns and issue cards. Opening it keeps your conversation visible.
- **Kanban layout:** status columns run horizontally, with independent vertical
  scrolling and pinned column headings. Scroll sideways in a narrow side panel.
- **JQL filters and pagination:** narrow a board to your work and load more
  issues as needed.
- **Issue details:** descriptions, custom fields, comments, links, subtasks and
  attachment metadata. Open tickets by key or Jira browse URL.
- **Add to chat:** insert a Jira mention without replacing your draft. BB
  fetches the current issue context when you send the message.
- **Drag to chat:** drag a ticket from the side panel into the message box to
  insert a Jira mention at the drop position.
- **@ mentions:** search for Jira tickets directly from the composer.
- **Agent access:** four native tools, a CLI and a bundled skill for reading
  issues and boards with stored credentials.

## Installation

Requires **BB 0.47+** with **Plugin SDK 0.6.79+**, and access to a Jira Software
instance. The BB server must be able to reach Jira over HTTPS, including any
required VPN and trusted corporate TLS certificate.

Install from the default branch:

```sh
bb plugin install https://github.com/viartemev/bb-jira.git
```

Or track compatible `0.1.x` releases:

```sh
bb plugin install 'git:https://github.com/viartemev/bb-jira.git@^0.1.0'
```

BB installs dependencies and builds the plugin. Review the source and BB's
installation confirmation before installing third-party plugins.

## Setup

Open **Settings → Plugins → Jira** and fill in:

| Setting | Value |
| --- | --- |
| Jira URL | HTTPS URL, including any context path, e.g. `https://jira.example.com/jira` |
| Authentication | **Data Center / Server — PAT** (default), or **Cloud — email + API token** |
| Token | Enter your token in BB's secret settings field |
| Account email | Required for Cloud; leave empty for PAT mode |
| Board IDs | Comma-separated IDs such as `17, 42`; empty lists all accessible boards |

Find board IDs in Jira board URLs, for example `rapidView=17` or `/boards/17`.
Open the side panel’s **+ → Jira** tab (alongside Browser and Terminal),
Use **Settings → Plugins → Jira** for **Test connection** and **Refresh boards**.
The board toolbar also has a refresh icon beside the compact issue lookup. Existing threads also have a
**Jira** button in their header to open or close the tab.
Switching the Jira deployment refreshes the form: the account email is shown only for Cloud, and the token label matches the deployment. Existing settings are preserved. A connection status section explicitly confirms whether a token is saved; use **Test connection** to verify it with Jira. The hidden token field displays `[set]` after saving; this means the token is stored, not that you must enter it again.

**Never paste a token into a chat, issue report or shell command.** BB stores
the token as a secret setting on the server; it is not sent to the frontend
or included in agent tool results.

### Jira authentication

- **Data Center / Server:** PAT mode uses `Authorization: Bearer`. Jira
  Software 8.14+ provides PAT support and the Agile REST APIs used here.
- **Cloud:** use an account email and a classic unscoped API token against
  your Jira site URL. Scoped tokens using the Atlassian gateway and OAuth
  are not implemented. Cloud mention search uses the enhanced
  `/rest/api/3/search/jql` endpoint.

API support is covered by automated tests with fake Jira responses. A real
Jira deployment has not yet been verified; please report compatibility issues
with the deployment type and version, without private ticket data.

## Usage

### From a board

Open **Jira** from the side panel’s **+** menu, select a board, and click a card
to inspect it. Drag a card into the message box or use **Add to chat** to
place the ticket in the message draft, then add your request:

> Investigate the bug, explain the cause, and propose a fix.

Sending the message resolves the Jira mention into fresh issue context. The
plugin does not send a message automatically. The side panel stays beside your
current conversation. Use BB’s panel toggle or close the Jira tab to hide it.

**New chat** opens a draft asking the selected agent to read the issue.

### From the composer

Type **@** followed by an issue key or search text and choose a Jira result.
You can also open a ticket in the Jira panel by pasting `APP-123` or its browse
URL, or ask the agent directly:

> Read APP-123 and check whether the current implementation meets its acceptance criteria.

### Filter a board

Enter JQL in the filter field, for example:

```jql
assignee = currentUser() AND resolution = Unresolved
```

Filters apply within the selected board. Columns and counts describe the
issues currently loaded; scroll down a column to load subsequent pages automatically. The refresh icon
in the top toolbar reloads the selected board;
**Refresh boards** in settings reloads open boards from the first page.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `jira_issue(key, field?, offset?)` | Current issue context; select a field to inspect large/custom values in 40k-character chunks |
| `jira_comments(key, startAt?)` | Up to 50 comments with the next page offset |
| `jira_boards(startAt?)` | Configured boards or a page of accessible boards |
| `jira_board_issues(boardId, jql?, startAt?)` | Up to 50 board issues with optional JQL and the next page offset |

The bundled Jira skill teaches agents to retrieve tickets by key or link,
follow pagination, and treat issue content as reference data.

The CLI is available to users and agents too:

```sh
bb jira issue APP-123
bb jira boards --start 0
bb jira --help
```

## Permissions and data

The plugin **only reads Jira**. Access follows the token's Jira account
permissions. Configured board IDs control what the UI lists; they are not an
access-control boundary. Agents can read other tickets and boards accessible
to the account.

Issue data becomes part of the agent's context when you send a Jira mention
or use a Jira tool. Choose your agent provider accordingly. Requests use HTTPS,
reject redirects, time out after 20 seconds, and cap upstream responses at
8 MiB. Upstream error bodies and credentials are not included in error messages.

## Limitations

- No status changes, comments, assignments or other Jira writes.
- Drag cards into the message box on desktop; **Add to chat** and **@**
  mentions also work without dragging, including on touch devices.
- Initial context includes all returned fields, the first 50 comments, links,
  subtasks and attachment metadata, capped at 48k characters with an explicit
  truncation notice. Agents can request more comment pages or individual fields.
- Very large single comments are explicitly truncated at 60k characters.
- Attachment bodies, screenshots, full issue history and linked issues are
  not automatically downloaded or recursively expanded.
- Descriptions and comments display as plain text, with Jira Cloud ADF conversion.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Configuration message | Set the Jira URL and token in the plugin settings |
| HTTP 401 | Token validity, authentication mode, and Cloud account email |
| HTTP 403 or 404 | Account permissions and whether the board or issue is visible in Jira |
| Network or TLS error | Server-side VPN, HTTPS URL, corporate certificate trust and context path |
| No boards | Board IDs, Jira Software access, then refresh |
| Missing agent tools | Start a new agent session so BB can load the plugin's tools and skill |
| HTTP 429 | Wait before retrying; Jira is rate limiting requests |

[Report a bug](https://github.com/viartemev/bb-jira/issues/new) with sanitized
reproduction steps and your BB/Jira versions. Do not include tokens or private
issue content.

## Development

Use Node.js 24 and a compatible BB installation:

```sh
git clone https://github.com/viartemev/bb-jira.git
cd bb-jira
npm ci --include=dev
npm run typecheck
npm test
bb plugin build
bb plugin install .
```

GitHub Actions checks types and tests. Before releases, also build the server
and frontend bundles with `bb plugin build`. Tests cover auth, pagination,
rich text, input validation, bounded output, mention resolution and draft
insertion using fake Jira responses and BB's public SDK harness.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
