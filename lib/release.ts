export const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Drop GitHub's HTML comment and a "What's Changed" heading that only introduces category headings. */
export function tidyNotes(notes: string): string {
  return notes.replace(/<!--[\s\S]*?-->/g, "").replace(/^## What's Changed[ \t]*\n+(?=#)/m, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Put a release section under the changelog intro and above the newest release. */
export function addRelease(changelog: string, version: string, date: string, notes: string): string {
  if (!versionPattern.test(version)) throw new Error(`"${version}" is not a semantic version such as 1.2.3.`);
  if (new RegExp(`^## \\[?${escape(version)}\\]?(?:\\s.*)?$`, "m").test(changelog)) throw new Error(`CHANGELOG.md already has a section for ${version}.`);
  const body = tidyNotes(notes).replace(/^## /gm, "### "); // groups sit one level below the release heading
  if (!body) throw new Error("Release notes are empty.");
  const section = `## ${version} — ${date}\n\n${body}\n\n`;
  const first = changelog.search(/^## /m);
  return first < 0 ? `${changelog.trimEnd()}\n\n${section.trimEnd()}\n` : changelog.slice(0, first) + section + changelog.slice(first);
}
