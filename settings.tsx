import { useEffect, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { Button } from "./components/ui/button";

export function CredentialStatus() {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [status, setStatus] = useState<{ saved: boolean; cloud: boolean } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let active = true;
    rpc.call("credential_status").then(value => { if (active) setStatus(value); }, () => { if (active) setError("Could not read token status. Reopen the settings to try again."); });
    return () => { active = false; };
  }, [rpc, connection]);
  useRealtime("credential-status-changed", () => {
    setFeedback(""); setError("");
    rpc.call("credential_status").then(setStatus, () => setError("Could not refresh token status."));
  });
  async function testConnection() {
    setChecking(true); setFeedback(""); setError("");
    try { const user = await rpc.call("connection"); setFeedback(`Connected as ${user.displayName}.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Connection failed."); }
    finally { setChecking(false); }
  }
  return <div className="space-y-3 text-sm">
    <p role="status">{status ? status.saved ? `${status.cloud ? "Cloud API token" : "PAT"} saved securely. You do not need to enter it again.` : "No token saved yet. Enter a token above and save it." : "Checking saved token…"}</p>
    <p className="text-muted-foreground">{status?.cloud ? "Cloud uses your Atlassian account email and a classic API token." : "Data Center / Server uses a personal access token; no email or password is required."} Saving a token stores it; use Test connection to verify that Jira accepts it.</p>
    <Button variant="outline" disabled={!status?.saved || checking} onClick={() => void testConnection()}>{checking ? "Testing…" : "Test connection"}</Button>
    {feedback && <p role="status">{feedback}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
