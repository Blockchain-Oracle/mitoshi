"use client";
// `/settings/account` → Your data (S13 step 10; D34, App Review 5.1.1(v) and 5.1.2(i)): Sensei's AI sharing with its
// withdrawal; a download of every off-chain row; and deletion in 21st 25081 (cnippet-dev/v-form-12)'s danger zone —
// the warning card, the icon, the phrase set as code, the note under the field — typed confirm (D-052), hold to confirm
// (ux.md: hold for deletion), a fresh signature of `deletionMessage`, then 5 s with Undo (`UNDO_WINDOW_MS`, D43) before
// anything is sent. The chain's part is said plainly: it stays.
import { deletionMessage, networkFrom, UNDO_WINDOW_MS, type Address } from "@cwf/core";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { useAiConsent, withdrawAiConsent } from "@/features/sensei/consent";
import { useSocialSession } from "@/features/social/session";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { DATA } from "./data-copy";

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

export function DataSection({ address, className }: { address: Address; className?: string }) {
  const consent = useAiConsent();
  const social = useSocialSession();
  const shell = useWalletShell();
  const [exporting, setExporting] = useState(false);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"idle" | "signing" | "waiting" | "sending">("idle");
  const undo = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (undo.current && clearTimeout(undo.current)), []);

  const exportData = async () => {
    setExporting(true);
    const session = await social.ensure();
    const ok = session.ok && (await download());
    setExporting(false);
    if (!ok) notify.item({ id: "data-export", type: "warning", title: session.ok ? DATA.export.failed : DATA.export.signIn });
  };

  const send = async (text: string, signature: string) => {
    setPhase("sending");
    const res = await fetch("/api/account/data", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, signature }) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { deleted?: Record<string, number>; message?: string }) : {};
    setPhase("idle");
    setTyped("");
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
    notify.item({
      id: "data-delete",
      title: DATA.delete.pending(UNDO_WINDOW_MS / 1000),
      timeout: UNDO_WINDOW_MS,
      action: { label: DATA.delete.undo, onClick: () => (undo.current && clearTimeout(undo.current), setPhase("idle"), notify.item({ id: "data-delete", title: DATA.delete.undone })) },
    });
    undo.current = setTimeout(() => void send(text, signature), UNDO_WINDOW_MS);
  };

  const ready = typed.trim().toUpperCase() === DATA.delete.word && phase === "idle";
  const agreed = consent ? PROVIDER[consent.provider] ?? consent.provider : null;
  return (
    <section aria-labelledby="data-title" className={className}>
      <h2 id="data-title" className="type-title text-ink">{DATA.title}</h2>
      <p className="type-caption text-ink-secondary">{DATA.lead}</p>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <h3 className="type-body-strong text-ink">{DATA.ai.title}</h3>
        <p className="type-body text-ink-secondary">{agreed && consent ? DATA.ai.on(agreed, new Date(consent.atMs).toLocaleDateString()) : DATA.ai.off}</p>
        {agreed ? <button type="button" onClick={() => (withdrawAiConsent(), notify.item({ id: "ai-consent", title: DATA.ai.stopped }))} className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink">{DATA.ai.stop}</button> : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <h3 className="type-body-strong text-ink">{DATA.export.title}</h3>
        <p className="type-body text-ink-secondary">{DATA.export.body}</p>
        <button type="button" onClick={() => void exportData()} disabled={exporting} className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink disabled:opacity-50">{exporting ? DATA.export.working : DATA.export.button}</button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
        <div className="flex items-start gap-3">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 flex-none text-warning" />
          <h3 className="type-body-strong text-ink">{DATA.delete.title}</h3>
        </div>
        <p className="type-body text-ink-secondary">{DATA.delete.body}</p>
        <p className="type-body text-ink">{DATA.delete.chain}</p>
        <label className="flex flex-col gap-1">
          <span className="type-caption text-ink">{DATA.delete.typePrefix} <code className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono">{DATA.delete.word}</code> {DATA.delete.typeSuffix}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={DATA.delete.word} autoComplete="off" spellCheck={false} disabled={phase !== "idle"} className="min-h-touch max-w-60 rounded-md border border-hairline bg-surface-1 px-3 text-base text-ink" />
          <span className="type-caption text-ink-secondary">{DATA.delete.permanent}</span>
        </label>
        {phase === "idle" ? (
          <HoldToConfirm className="max-w-80" confirmLabel={DATA.delete.holding} onConfirm={() => void requestDeletion()} disabled={!ready}>{DATA.delete.hold}</HoldToConfirm>
        ) : (
          <p role="status" className="type-body text-ink-secondary">{phase === "signing" ? DATA.delete.signing : phase === "waiting" ? DATA.delete.pending(UNDO_WINDOW_MS / 1000) : DATA.delete.holding}</p>
        )}
      </div>
    </section>
  );
}
