// Add a release to CHANGELOG.md: tsx scripts/changelog.ts 0.2.1 release-notes.md
import { readFileSync, writeFileSync } from "node:fs";
import { addRelease } from "../lib/release";

const [version, notesFile] = [process.argv[2]?.replace(/^v/, ""), process.argv[3]];
if (!version || !notesFile) { console.error("Usage: changelog.ts <version> <notes-file>"); process.exit(2); }
try {
  writeFileSync("CHANGELOG.md", addRelease(readFileSync("CHANGELOG.md", "utf8"), version, new Date().toISOString().slice(0, 10), readFileSync(notesFile, "utf8")));
} catch (e) { console.error(`::error::${e instanceof Error ? e.message : e}`); process.exit(1); }
