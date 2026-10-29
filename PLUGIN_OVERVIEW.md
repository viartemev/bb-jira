## Jira tickets, next to your conversation

Choose Jira boards in the plugin settings, browse horizontal Kanban columns beside the conversation, and filter with JQL. A compact toolbar provides issue lookup and refresh; tasks load as you scroll. Open a ticket to inspect its description, fields, comments, subtasks and links.

Drag a card into the message input or use **Add to chat** to place a Jira mention in your draft. When you send the message, BB fetches the current ticket context for the agent. You can also find tickets through the **@** menu or open a new conversation with an issue key.

Agents receive tools to read issues, individual custom fields, comment pages and board issues. A CLI and bundled skill provide the same workflow from the terminal. The token stays in BB's secret settings.

## Connection and scope

Supports Jira Server / Data Center PAT authentication and Jira Cloud classic API tokens with an account email. The BB server needs HTTPS network access to Jira.

This version reads Jira only. It includes attachment metadata but does not download attachment contents or modify tickets. Large context is explicitly truncated, and agents can request further field and comment pages. Dragging adds issue context to the message draft; it does not change the ticket’s Jira status.
