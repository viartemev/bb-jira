// Print the CHANGELOG.md section for a version: tsx scripts/release-notes.ts 0.2.1
import { readFileSync } from "node:fs";
import { extractNotes } from "../lib/release";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) { console.error("Usage: release-notes.ts <version>"); process.exit(2); }
try { console.log(extractNotes(readFileSync("CHANGELOG.md", "utf8"), version)); }
catch (e) { console.error(`::error::${e instanceof Error ? e.message : e}`); process.exit(1); }
