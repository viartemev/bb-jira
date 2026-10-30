import test from "node:test";
import assert from "node:assert/strict";
import { extractNotes, promoteUnreleased } from "../lib/release";

const log = "# Changelog\n\n## Unreleased\n\n- New thing.\n\n## 0.2.0 — 2026-10-29\n\n- Old thing.\n- Another.\n\n## 0.1.0 — 2026-10-29\n\nInitial release.\n";

test("extractNotes returns only the requested section", () => {
  assert.equal(extractNotes(log, "0.2.0"), "- Old thing.\n- Another.");
  assert.equal(extractNotes(log, "0.1.0"), "Initial release.");
  assert.throws(() => extractNotes(log, "0.3.0"), /no section for 0\.3\.0/);
  assert.throws(() => extractNotes("## 0.2.0\n\n## 0.1.0\nx", "0.2.0"), /empty/);
  assert.throws(() => extractNotes(log, "0.2"), /no section/);
});

test("promoteUnreleased dates the section and leaves a fresh one", () => {
  const out = promoteUnreleased(log, "0.2.1", "2026-11-01");
  assert.match(out, /## Unreleased\n\n## 0\.2\.1 — 2026-11-01\n\n- New thing\./);
  assert.equal(extractNotes(out, "0.2.1"), "- New thing.");
  assert.throws(() => promoteUnreleased(out, "0.2.2", "2026-11-02"), /Unreleased.*empty/);
  assert.throws(() => promoteUnreleased(log, "0.2.0", "2026-11-01"), /already has/);
  assert.throws(() => promoteUnreleased(log, "v1", "2026-11-01"), /semantic version/);
  assert.throws(() => promoteUnreleased("# Changelog\n", "1.0.0", "2026-11-01"), /no "## Unreleased"/);
});
