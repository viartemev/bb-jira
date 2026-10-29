// Keep ORDER BY outside parenthesized clauses; ignore those words in quoted values.
export function combineBoardFilters(jql: string, filters: string[]): string {
  if (!filters.length) return jql;
  let quote = "", depth = 0, order = -1;
  for (let i = 0; i < jql.length; i++) {
    const ch = jql[i];
    if (ch === "\\") { i++; continue; }
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && (i === 0 || /\s/.test(jql[i - 1])) && /^ORDER\s+BY\b/i.test(jql.slice(i))) { order = i; break; }
  }
  const clause = order < 0 ? jql : jql.slice(0, order);
  const combined = [clause, ...filters].map(s => s.trim()).filter(Boolean).map(s => `(${s})`).join(" AND ");
  return order < 0 ? combined : `${combined} ${jql.slice(order)}`;
}
