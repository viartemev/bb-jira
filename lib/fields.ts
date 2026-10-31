/** Labels for Jira fields: "Sprint (customfield_10020)" when Jira names a field, the bare ID otherwise. */
export function fieldLabel(id: string, names: Record<string, string> = {}): string {
  const name = names[id];
  return name && name !== id ? `${name} (${id})` : id;
}

/** Re-key fields by their labels, keeping Jira's order. */
export function namedFields(fields: Record<string, unknown>, names: Record<string, string> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([id, value]) => [fieldLabel(id, names), value]));
}
