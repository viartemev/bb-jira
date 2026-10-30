import test from "node:test";
import assert from "node:assert/strict";
import { addRelease, tidyNotes } from "../lib/release";

const log = "# Changelog\n\nIntro line.\n\n## 0.2.0 — 2026-10-29\n\n- Old thing.\n";

test("addRelease puts the newest release first and keeps the intro", () => {
  const out = addRelease(log, "0.2.1", "2026-11-01", "## What's Changed\n* Fix search by @a in #10\n\n**Full Changelog**: x");
  assert.equal(out, "# Changelog\n\nIntro line.\n\n## 0.2.1 — 2026-11-01\n\n### What's Changed\n* Fix search by @a in #10\n\n**Full Changelog**: x\n\n## 0.2.0 — 2026-10-29\n\n- Old thing.\n");
});

test("addRelease works on a changelog without releases and rejects bad input", () => {
  assert.equal(addRelease("# Changelog\n", "1.0.0", "2026-11-01", "- First."), "# Changelog\n\n## 1.0.0 — 2026-11-01\n\n- First.\n");
  assert.throws(() => addRelease(log, "0.2.0", "2026-11-01", "- x"), /already has/);
  assert.throws(() => addRelease(log, "v1", "2026-11-01", "- x"), /semantic version/);
  assert.throws(() => addRelease(log, "0.3.0", "2026-11-01", "  \n"), /empty/);
});

test("tidyNotes removes the generator comment and a redundant heading", () => {
  const raw = "<!-- Release notes generated using configuration in .github/release.yml at v1 -->\n\n## What's Changed\n### Other changes\n* A by @a in #1\n\n\n**Full Changelog**: x\n";
  assert.equal(tidyNotes(raw), "### Other changes\n* A by @a in #1\n\n**Full Changelog**: x");
  assert.equal(tidyNotes("## What's Changed\n* A in #1"), "## What's Changed\n* A in #1");
});
