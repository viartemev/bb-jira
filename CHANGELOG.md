# Changelog

## Unreleased

- Horizontal Kanban columns with fixed headers, counts, and independent scrolling.
- Compact board/JQL/issue toolbar with an icon to refresh the current board.
- Automatic task pagination when scrolling a column.
- Connection testing and board refresh controls in plugin settings.
- README screenshots using fictional demonstration data.

- Open Jira in BB’s full-height side panel, alongside Browser and Terminal,
  with a header button in existing threads and a launcher on the New thread screen.
- Drag issue cards into the composer as native Jira mentions.
- Use a distinct Jira-inspired diamond icon throughout BB.

## 0.1.0 — 2026-10-29

Initial release.

- Jira board browser in the BB sidebar and thread panels, configured columns,
  JQL filtering and paginated issue cards.
- Issue detail with descriptions, custom fields, comments, links, subtasks and
  attachment metadata.
- Add-to-chat mentions that fetch current issue context when sent; issue
  search from the @ menu and a new-chat shortcut.
- Four native agent tools, the `bb jira` CLI and a bundled Jira skill.
- Data Center / Server PAT and Cloud classic API token authentication using
  BB secret settings.

Read-only. Card dragging, attachment bodies and full issue history are not
included. Jira compatibility has automated coverage with fake responses;
a real Jira deployment still needs verification.
