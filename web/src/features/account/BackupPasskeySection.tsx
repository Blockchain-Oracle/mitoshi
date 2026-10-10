"use client";
// `/settings/account` → Backup passkey (S13 step 10; D-053 "passkey devices + backup-passkey prompt after the first
// deposit"): a second passkey on another device or security key, authorised on chain as a TIP-1049 admin key of this
// account (`key-backup`, root-signed, unsponsored), then recorded so it can sign in as the account. The nudge turns
// up once there is money on the account and no backup.
import type { Address } from "@cwf/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { createWebAuthnCredential } from "viem/account-abstraction";
import { getAddress, keccak256, type Hex } from "viem";
import { useTxLifecycle } from "@/components/tx";
import { diagnosisCopy } from "@/lib/copy";
import { notify } from "@/lib/toast";
import { BACKUP } from "./backup-copy";

interface BackupAnswer {
  account: string;
  rpId: string;
  credentialId: string | null;
  backups: { credentialId: string; keyId: string; name: string | null; createdAt: string }[];
}

/** The account address of an uncompressed P-256 public key (Tempo's derivation: the last 20 bytes of keccak(x‖y)). */
const keyIdOf = (publicKey: Hex) => getAddress(`0x${keccak256(`0x${publicKey.slice(4)}`).slice(-40)}`) as Address;

export function BackupPasskeySection({ hasMoney, className }: { hasMoney: boolean; className?: string }) {
  const tx = useTxLifecycle();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "creating" | "authorising" | "saving">("idle");
  // Why the last attempt stopped, kept on screen (a toast is gone before anyone reads it).
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["backup-passkeys"],
    queryFn: async (): Promise<BackupAnswer> => {
      const res = await fetch("/api/account/backup-passkey", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`backups ${res.status}`);
      return (await res.json()) as BackupAnswer;
    },
  });
  const data = q.data;
  const add = async () => {
    if (!data?.credentialId) return;
    setError(null);
    setPhase("creating");
    let credential: { id: string; publicKey: Hex };
    try {
      // Another device or a security key (cross-platform): a backup on this same device wouldn't survive losing it.
      const c = await createWebAuthnCredential({
        name: BACKUP.name,
        rp: { id: data.rpId, name: "Mitoshi" },
        excludeCredentialIds: [data.credentialId, ...data.backups.map((b) => b.credentialId)],
        authenticatorSelection: { authenticatorAttachment: "cross-platform", residentKey: "required", userVerification: "required" },
      });
      credential = { id: c.id, publicKey: `0x04${c.publicKey.slice(2)}` as Hex };
    } catch (e) {
      setPhase("idle");
      setError(`${BACKUP.cancelled} ${e instanceof Error ? e.message.split("\n")[0]!.slice(0, 160) : ""}`.trim());
      return notify.item({ id: "backup", title: BACKUP.cancelled });
    }
    setPhase("authorising");
    const outcome = await tx.run({ kind: "key-backup", keyId: keyIdOf(credential.publicKey) });
    if (outcome?.status !== "confirmed") {
      setPhase("idle");
      const d = outcome && "diagnosis" in outcome ? outcome.diagnosis : undefined;
      // The headline for people; the technical line (truncated) so a report can say what the chain answered.
      const why = d ? `${diagnosisCopy(d.kind).headline}. ${d.technical.split("\n")[0]!.slice(0, 140)}` : outcome === null ? BACKUP.noSigner : "";
      setError(`${BACKUP.failed} ${why}`.trim());
      return notify.item({ id: "backup", type: "warning", title: BACKUP.failed });
    }
    setPhase("saving");
    const res = await fetch("/api/account/backup-passkey", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentialId: credential.id, publicKey: credential.publicKey, name: BACKUP.name }) }).catch(() => null);
    setPhase("idle");
    if (!res?.ok) {
      const json = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : {};
      setError(json.message ?? BACKUP.failed);
      return notify.item({ id: "backup", type: "warning", title: json.message ?? BACKUP.failed });
    }
    notify.item({ id: "backup", title: BACKUP.done });
    await Promise.all([qc.invalidateQueries({ queryKey: ["backup-passkeys"] }), qc.invalidateQueries({ queryKey: ["account-keys"] })]);
  };
  if (q.isPending || !data) return null;
  const passkey = data.credentialId !== null;
  const nudge = passkey && hasMoney && data.backups.length === 0;
  return (
    <section id="backup" aria-labelledby="backup-title" className={className}>
      <h2 id="backup-title" className="flex items-center gap-2 type-title text-ink"><KeyRound aria-hidden className="size-5" />{BACKUP.title}</h2>
      {!passkey ? <p className="type-body text-ink-secondary">{BACKUP.passkeyOnly}</p> : (
        <>
          {nudge ? <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 type-body text-ink"><ShieldAlert aria-hidden className="mt-0.5 size-4 flex-none text-warning" />{BACKUP.nudge}</p> : null}
          <p className="type-body text-ink-secondary">{BACKUP.lead}</p>
          {data.backups.length === 0 ? <p className="type-body text-ink">{BACKUP.none}</p> : (
            <ul className="flex flex-col divide-y divide-hairline">
              {data.backups.map((b) => (
                <li key={b.credentialId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="type-body-strong text-ink">{b.name ?? BACKUP.name}</span>
                  <span className="numbers type-caption text-ink-secondary">{b.keyId.slice(0, 10)}… · {BACKUP.added(new Date(b.createdAt).toLocaleDateString())}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="type-caption text-ink-secondary">{BACKUP.how}</p>
          <p className="type-caption text-ink-secondary">{BACKUP.fee}</p>
          {error && phase === "idle" ? <p role="alert" className="type-body text-warning">{error}</p> : null}
          {phase === "idle" ? (
            <button type="button" onClick={() => void add()} className="min-h-touch self-start rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{BACKUP.add}</button>
          ) : <p role="status" className="type-body text-ink-secondary">{BACKUP[phase]}</p>}
        </>
      )}
    </section>
  );
}
