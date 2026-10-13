"use client";
// `/settings/account` → DATA (S13 step 10; D34, App Review 5.1.1(v) and 5.1.2(i)), as grouped rows (R4-11, D-227; Owarine
// 90a91d71 AccountSheet ends on one destructive row behind a confirm): AI sharing as a toggle that withdraws Sensei's
// consent, Download as a row, and Delete as a row whose sheet holds 21st 25081 (cnippet-dev/v-form-12)'s danger zone —
// typed confirm (D-052), hold to confirm, a fresh signature of `deletionMessage`, then 5 s with Undo (`UNDO_WINDOW_MS`,
// D43) before anything is sent. The pending deletion lives at module scope, so leaving the page during the Undo window
// no longer cancels it silently while the toast keeps counting (R4-11 bug): it is sent when the toast says it will be.
import { deletionMessage, networkFrom, UNDO_WINDOW_MS, type Address } from "@cwf/core";
import { TriangleAlert } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { GroupedToggle } from "@/components/kit/GroupedList";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { useAiConsent, withdrawAiConsent } from "@/features/sensei/consent";
import { useSocialSession } from "@/features/social/session";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { DATA } from "./data-copy";
import "@/components/kit/kit.css";

const PROVIDER = { anthropic: "Anthropic (Claude)", openai: "OpenAI", google: "Google (Gemini)" } as Record<string, string>;
const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

async function download(): Promise<boolean> {
  const res = await fetch("/api/account/data", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (!res?.ok) return false;
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "mitoshi-data.json";
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** AI sharing: on while Sensei has consent (the provider under it); turning it off withdraws it. Sensei asks to turn it on. */
export function AiSharingRow() {
  const consent = useAiConsent();
  const agreed = consent ? PROVIDER[consent.provider] ?? consent.provider : null;
  return (
    <GroupedToggle
      label={DATA.ai.title}
      sub={agreed ?? DATA.ai.off}
      checked={agreed !== null}
      disabled={agreed === null}
      onChange={(on) => (on ? undefined : (withdrawAiConsent(), notify.item({ id: "ai-consent", title: DATA.ai.stopped })))}
    />
  );
}

export function useDataExport() {
  const social = useSocialSession();
  const [working, setWorking] = useState(false);
  const run = async () => {
    if (working) return;
    setWorking(true);
    const session = await social.ensure();
    const ok = session.ok && (await download());
    setWorking(false);
    if (!ok) notify.item({ id: "data-export", type: "warning", title: session.ok ? DATA.export.failed : DATA.export.signIn });
  };
  return { working, run };
}

// The one pending deletion (module scope: it outlives the sheet and the page). `phase` is what the sheet shows.
type Phase = "idle" | "signing" | "waiting" | "sending";
let phase: Phase = "idle";
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const setPhase = (next: Phase) => ((phase = next), listeners.forEach((l) => l()));
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const usePhase = () => useSyncExternalStore(subscribe, () => phase, () => "idle" as Phase);

export function DeleteSheetBody({ address }: { address: Address }) {
  const social = useSocialSession();
  const shell = useWalletShell();
  const current = usePhase();
  const [typed, setTyped] = useState("");

  const send = async (text: string, signature: string) => {
    timer = null;
    setPhase("sending");
    const res = await fetch("/api/account/data", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, signature }) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { deleted?: Record<string, number>; message?: string }) : {};
    setPhase("idle");
    if (!res?.ok || !json.deleted) return notify.item({ id: "data-delete", type: "warning", title: json.message ?? DATA.delete.failed });
    withdrawAiConsent();
    // The sessions go with the data (D34: "KV session records"): the social cookie, then the passkey session the
    // wallet's disconnect revokes on the server.
    await social.signOut();
    notify.item({ id: "data-delete", title: DATA.delete.done(Object.values(json.deleted).reduce((a, b) => a + b, 0)) });
    await shell.disconnect().catch(() => undefined);
  };

  const requestDeletion = async () => {
    const session = await social.ensure();
    if (!session.ok) return notify.item({ id: "data-delete", type: "warning", title: DATA.export.signIn });
    setPhase("signing");
    const text = deletionMessage({ address, network: networkFrom(webEnv.markets.network), issuedAtSec: Math.floor(Date.now() / 1000), nonce: nonce() });
    let signature: string;
    try {
      signature = await shell.signMessage(text);
    } catch {
      setPhase("idle");
      return notify.item({ id: "data-delete", type: "warning", title: DATA.delete.refused });
    }
    // The undo window: nothing leaves the browser until it passes.
    setPhase("waiting");
    setTyped("");
    notify.item({
      id: "data-delete",
      title: DATA.delete.pending(UNDO_WINDOW_MS / 1000),
      timeout: UNDO_WINDOW_MS,
      action: { label: DATA.delete.undo, onClick: () => (timer && clearTimeout(timer), (timer = null), setPhase("idle"), notify.item({ id: "data-delete", title: DATA.delete.undone })) },
    });
    timer = setTimeout(() => void send(text, signature), UNDO_WINDOW_MS);
  };

  const ready = typed.trim().toUpperCase() === DATA.delete.word && current === "idle";
  return (
    <div className="acct-danger">
      <p className="acct-danger-lead">
        <TriangleAlert aria-hidden className="size-5 flex-none text-warning" />
        <span className="type-body text-ink">{DATA.delete.body}</span>
      </p>
      <p className="type-caption text-ink-secondary">{DATA.lead} {DATA.delete.chain}</p>
      <label className="flex flex-col gap-1">
        <span className="type-caption text-ink">{DATA.delete.typePrefix} <code className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono">{DATA.delete.word}</code> {DATA.delete.typeSuffix}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={DATA.delete.word} autoComplete="off" spellCheck={false} disabled={current !== "idle"} className="min-h-touch rounded-md border border-hairline bg-surface-1 px-3 text-base text-ink" />
      </label>
      {current === "idle" ? (
        <HoldToConfirm confirmLabel={DATA.delete.holding} onConfirm={() => void requestDeletion()} disabled={!ready}>{DATA.delete.hold}</HoldToConfirm>
      ) : (
        <p role="status" className="type-body text-ink-secondary">{current === "signing" ? DATA.delete.signing : current === "waiting" ? DATA.delete.pending(UNDO_WINDOW_MS / 1000) : DATA.delete.holding}</p>
      )}
    </div>
  );
}
