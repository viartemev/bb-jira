// Prepare a release locally: npm run release -- 0.2.1
// Bumps package.json, dates the Unreleased changelog section, commits and tags.
// It never pushes; the final command is printed so you decide when to publish.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promoteUnreleased, versionPattern } from "../lib/release";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (message: string): never => { console.error(message); process.exit(1); };

const version = process.argv[2]?.replace(/^v/, "") ?? "";
if (!versionPattern.test(version)) fail("Usage: npm run release -- <version>   (for example 0.2.1)");
if (git("branch", "--show-current") !== "main") fail("Release from the main branch.");
if (git("status", "--porcelain")) fail("The working tree is not clean. Commit or stash first.");
if (git("tag", "--list", `v${version}`)) fail(`Tag v${version} already exists.`);

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
try {
  const changelog = promoteUnreleased(readFileSync("CHANGELOG.md", "utf8"), version, new Date().toISOString().slice(0, 10));
  writeFileSync("CHANGELOG.md", changelog);
} catch (e) { git("checkout", "--", "package.json"); fail(e instanceof Error ? e.message : String(e)); }

git("add", "package.json", "CHANGELOG.md");
git("commit", "-m", `Release ${version}`);
git("tag", "-a", `v${version}`, "-m", `Release v${version}`);
console.log(`Committed and tagged v${version}. Publish with:\n  git push origin main v${version}`);
