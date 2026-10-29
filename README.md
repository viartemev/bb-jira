# Jira for BB

Browse Jira boards alongside BB conversations and hand tickets to coding agents.

## Features

- Jira entry in the sidebar and a Jira panel in existing and new threads.
- Configurable boards, their configured columns, issue cards, JQL filters and pagination.
- Open an issue by key or browse URL; inspect its description, custom fields, comments, links, subtasks and attachment metadata.
- **Add to chat** inserts a Jira mention into the draft. BB loads fresh issue context when you send the message. Existing draft text is preserved; the plugin does not send it automatically.
- Search Jira from the chat's **@** mention menu, or ask the agent to read a ticket by key/link.
- **New chat** opens a draft asking the selected agent to read the issue with `jira_issue`.
- Native agent tools and a `bb jira` CLI; credentials remain on the BB server.

## Install

Requires BB 0.47+ with Plugin SDK 0.6.79+.

```sh
bb plugin install https://github.com/viartemev/bb-jira.git
```

For a local checkout:

```sh
npm ci --include=dev
bb plugin build
bb plugin install .
```

## Configure

Open **Settings → Plugins → Jira**:

- **Jira URL**: the HTTPS URL, including the context path if applicable, e.g. `https://jira.example.com/jira`.
- **Authentication**: Data Center / Server PAT (default), or Cloud email + API token.
- **Token**: enter it in the secret settings field. Never paste it into a chat or a shell command.
- **Account email**: required for Cloud only.
- **Board IDs**: comma-separated IDs from board URLs, e.g. `17, 42`. Leave empty to browse all accessible boards. This is a display preference, not an access-control boundary; agents can read any board accessible to the token.

Then open **Jira** in the sidebar and choose **Test connection**. In a thread, open Jira through the panel's new-tab menu. The BB server must have network/VPN access to Jira and trust its TLS certificate. Settings are read on every request; no reload is required.

PAT mode supports Jira Server / Data Center 8.14+ with Jira Software Agile REST APIs. Cloud mode supports email plus a classic unscoped API token against the site URL; scoped tokens using an Atlassian gateway and OAuth are not implemented. Cloud search uses the enhanced `/rest/api/3/search/jql` endpoint.

## Agent interface

- `jira_issue(key, field?, offset?)`: current issue context; use `field` (e.g. `customfield_12345`) to page through a large field's serialized value in 40k-character chunks.
- `jira_comments(key, startAt?)`: up to 50 comments, with a `next` offset.
- `jira_boards(startAt?)`: configured boards or a page of accessible boards.
- `jira_board_issues(boardId, jql?, startAt?)`: 50 issues per page, with a `next` offset.
- `bb jira issue APP-123`: bounded plain-text issue context.
- `bb jira boards --start 0`: board page as JSON.

A bundled skill teaches agents how to use ticket keys and Jira links without requesting the token.

## Scope and limits

This version only reads Jira. It does not change statuses, post comments, or assign tasks. Use **Add to chat** or **@** mentions; dragging cards is not implemented.

Issue context contains the description, all returned fields, first 50 comments, links, subtasks and attachment metadata. The context is capped at 48k characters, with an explicit truncation notice. Agents can request individual fields and subsequent comment pages. Very large single comments are explicitly truncated at 60k characters. Attachment bodies, screenshots, full issue history and linked issues are not automatically downloaded or recursively expanded. The description and comments are displayed as plain text, including Jira Cloud ADF conversion.

Requests use HTTPS, reject redirects, time out after 20 seconds and cap upstream responses at 8 MiB. Error messages do not include upstream bodies or credentials. Token access follows the Jira account's permissions. Ticket contents become part of the agent's context when you send a mention or call a tool.

## Development and validation

```sh
npm ci --include=dev
npm run typecheck
npm test
bb plugin build
```

Tests cover authentication, context paths, pagination, rich text, custom fields, input validation, error redaction, output limits, backend registration and mention resolution, and frontend draft insertion. The tests use fake Jira responses and BB's public SDK harness; a real Jira connection still needs operator verification.
