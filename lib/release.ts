export const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The body of one changelog section, up to the next `## ` heading. Throws when it is missing or empty. */
export function extractNotes(changelog: string, version: string): string {
  const heading = new RegExp(`^## \\[?${escape(version)}\\]?(?:\\s.*)?$`, "m").exec(changelog);
  if (!heading) throw new Error(`CHANGELOG.md has no section for ${version}. Add "## ${version} — YYYY-MM-DD".`);
  const rest = changelog.slice(heading.index + heading[0].length);
  const next = rest.search(/^## /m);
  const notes = (next < 0 ? rest : rest.slice(0, next)).trim();
  if (!notes) throw new Error(`The CHANGELOG.md section for ${version} is empty.`);
  return notes;
}

/** Turn the `## Unreleased` section into a dated release and leave a fresh empty one above it. */
export function promoteUnreleased(changelog: string, version: string, date: string): string {
  if (!versionPattern.test(version)) throw new Error(`"${version}" is not a semantic version such as 1.2.3.`);
  if (new RegExp(`^## \\[?${escape(version)}\\]?(?:\\s.*)?$`, "m").test(changelog)) throw new Error(`CHANGELOG.md already has a section for ${version}.`);
  const heading = /^## Unreleased[ \t]*$/m.exec(changelog);
  if (!heading) throw new Error('CHANGELOG.md has no "## Unreleased" section. Describe the changes there first.');
  const rest = changelog.slice(heading.index + heading[0].length);
  const next = rest.search(/^## /m);
  if (!(next < 0 ? rest : rest.slice(0, next)).trim()) throw new Error('The "## Unreleased" section is empty. Describe the changes first.');
  return `${changelog.slice(0, heading.index)}## Unreleased\n\n## ${version} — ${date}${rest}`;
}
