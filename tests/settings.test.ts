import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

test("settings change deployment fields without losing existing credentials", async () => {
  let { bb, harness } = createFakePluginHost({ pluginId: "jira", settings: { pat: "fake-secret", email: "user@example.test" } });
  harness.sdk.stub("plugins.reload", async () => ({}));
  try {
    await plugin(bb);
    await harness.behavior.callRpc("refresh_boards", null);
    assert.equal(harness.realtimeSignals.at(-1)?.channel, "boards-refresh-requested");
    assert.equal(harness.registrations.settingsDescriptors.email, undefined);
    assert.equal(harness.registrations.settingsDescriptors.pat.label, "Personal access token (PAT)");
    assert.deepEqual(await harness.behavior.callRpc("credential_status", null), { saved: true, cloud: false });
    await harness.behavior.setSettings({ authMode: "cloud" });
    assert.equal(harness.inspection.sdk.callsTo("plugins.reload").length, 1);
    ({ bb, harness } = await harness.lifecycle.reload(plugin));
    harness.sdk.stub("plugins.reload", async () => ({}));
    assert.equal(harness.registrations.settingsDescriptors.email.label, "Atlassian account email");
    assert.equal(harness.registrations.settingsDescriptors.pat.label, "Cloud API token");
    assert.deepEqual(await harness.behavior.callRpc("credential_status", null), { saved: true, cloud: true });
    assert.ok(!JSON.stringify(await harness.behavior.callRpc("credential_status", null)).includes("fake-secret"));
    await harness.behavior.setSettings({ authMode: "pat" });
    ({ bb, harness } = await harness.lifecycle.reload(plugin));
    harness.sdk.stub("plugins.reload", async () => ({}));
    assert.equal(harness.registrations.settingsDescriptors.email, undefined);
    await harness.behavior.setSettings({ pat: null });
    assert.deepEqual(await harness.behavior.callRpc("credential_status", null), { saved: false, cloud: false });
    assert.equal(harness.realtimeSignals.at(-1)?.channel, "credential-status-changed");
  } finally { await harness.lifecycle.dispose(); }
});

test("token status updates after save and distinguishes stored from verified", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.example.test" });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  });
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { fireEvent } = await import("@testing-library/react");
  const { CredentialStatus } = await import("../settings");
  let saved = false;
  const slot = renderSlot({ component: CredentialStatus }, {}, { rpc: {
    credential_status: () => ({ saved, cloud: true }), connection: () => ({ displayName: "Sam" }), refresh_boards: () => null,
  } });
  try {
    await slot.findByText(/No token saved yet/);
    assert.equal((slot.getByRole("button", { name: "Test connection" }) as HTMLButtonElement).disabled, true);
    saved = true;
    await slot.behavior.emitRealtime("credential-status-changed", {});
    await slot.findByText(/Cloud API token saved securely/);
    fireEvent.click(slot.getByRole("button", { name: "Test connection" }));
    await slot.findByText("Connected as Sam.");
    fireEvent.click(slot.getByRole("button", { name: "Refresh boards" }));
    await slot.findByText("Open Jira tabs are reloading their boards and tasks.");
    await slot.behavior.emitRealtime("credential-status-changed", {});
    assert.equal(slot.queryByText("Connected as Sam."), null);
  } finally { slot.lifecycle.unmount(); dom.window.close(); }
});
