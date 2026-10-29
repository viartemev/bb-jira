import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

test("backend surfaces validate inputs, use fresh secrets and resolve issue mentions", async () => {
  const original = globalThis.fetch;
  const auth: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input)); auth.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (url.pathname.endsWith("/comment")) return Response.json({ comments: [], total: 0 });
    if (url.pathname.includes("/issue/")) return Response.json({ key: "APP-7", fields: { summary: "Checkout", description: "Task context", customfield_1: "Acceptance criteria" } });
    return Response.json({ values: [], isLast: true });
  }) as typeof fetch;
  const { bb, harness } = createFakePluginHost({ pluginId: "jira", settings: { baseUrl: "https://jira.example.test", pat: "fake-first" } });
  try {
    await plugin(bb);
    const patSetting = harness.registrations.settingsDescriptors.pat;
    assert.ok(patSetting.type === "string" && patSetting.secret);
    await harness.behavior.callRpc("boards", {});
    await assert.rejects(harness.behavior.callRpc("issues", { boardId: -1 }));
    await harness.behavior.setSettings({ pat: "fake-second" });
    const result = await harness.behavior.callAgentTool("jira_issue", { key: "APP-7" });
    assert.match(JSON.stringify(result), /Task context/);
    assert.match(JSON.stringify(result), /Acceptance criteria/);
    const mention = harness.registrations.mentionProviders[0];
    const resolved = await mention.resolve("APP-7");
    assert.match(resolved.context, /Task context/);
    assert.ok(!resolved.context.includes("fake-second"));
    assert.equal(auth[0], "Bearer fake-first");
    assert.equal(auth.at(-1), "Bearer fake-second");
    assert.equal((await harness.behavior.runCli(["boards", "--help"])).exitCode, 0);
    await assert.rejects(harness.behavior.setSettings({ baseUrl: "http://insecure.test" }));
    await assert.rejects(harness.behavior.setSettings({ boardIds: "../../secrets" }));
  } finally { globalThis.fetch = original; await harness.lifecycle.dispose(); }
});
test("plugin imports use public SDK only", async () => {
  const report = await experimental_scanPublicSdkOnly(process.cwd(), { allow: [/^(react|@radix-ui\/react-slot|class-variance-authority|clsx|tailwind-merge|jsdom|@testing-library\/react)$/] });
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.privateDependencies, []);
});
