/** Swimlane groupings offered in the board footer, with their labels. */
export const groupings = { assignee: "Assignee", parent: "Epic or parent", priority: "Priority", none: "Nothing" } as const;
export type Grouping = keyof typeof groupings;
/** What the Jira tab reopens with: the board, its applied JQL and quick filters, and the swimlane grouping. */
export type ViewState = { boardId: number | null; jql: string; quickFilterIds: string[]; grouping: Grouping };
