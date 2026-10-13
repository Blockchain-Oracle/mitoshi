"use client";
// R4-11 (D-227): the body of the account page's "Backup passkey" sheet, as Owarine 90a91d71:web/src/features/canton-ux/
// seat/seat.css's `.cx-link` card — a mark, a title, one sub-line, the two steps, the action and one foot line.
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
import { PillButton } from "@/components/kit/PillButton";
import { StepProgress } from "@/components/kit/desk-kit";
import { cn } from "@/lib/utils";
import { diagnosisCopy } from "@/lib/copy";
import { notify } from "@/lib/toast";
import { BACKUP } from "./backup-copy";
import "@/components/kit/kit.css";

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
  // Step 1 made this credential on the other device; step 2 authorises it with this passkey (two prompts, two clicks).
  const [created, setCreated] = useState<{ id: string; publicKey: Hex } | null>(null);
  const q = useQuery({
    queryKey: ["backup-passkeys"],
    queryFn: async (): Promise<BackupAnswer> => {
      const res = await fetch("/api/account/backup-passkey", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`backups ${res.status}`);
      return (await res.json()) as BackupAnswer;
    },
  });
  const data = q.data;
  const create = async () => {
    if (!data?.credentialId) return;
    setError(null);
    setPhase("creating");
    try {
      // Another device or a security key (cross-platform): a backup on this same device wouldn't survive losing it.
      const c = await createWebAuthnCredential({
        name: BACKUP.name,
        rp: { id: data.rpId, name: "Mitoshi" },
        excludeCredentialIds: [data.credentialId, ...data.backups.map((b) => b.credentialId)],
        authenticatorSelection: { authenticatorAttachment: "cross-platform", residentKey: "required", userVerification: "required" },
      });
      setCreated({ id: c.id, publicKey: `0x04${c.publicKey.slice(2)}` as Hex });
    } catch (e) {
      setError(`${BACKUP.cancelled} ${e instanceof Error ? e.message.split("\n")[0]!.slice(0, 160) : ""}`.trim());
      notify.item({ id: "backup", title: BACKUP.cancelled });
    } finally {
      setPhase("idle");
    }
  };
  const authorise = async () => {
    if (!created) return;
    setError(null);
    setPhase("authorising");
    const outcome = await tx.run({ kind: "key-backup", keyId: keyIdOf(created.publicKey) });
    if (outcome?.status !== "confirmed") {
      setPhase("idle");
      const d = outcome && "diagnosis" in outcome ? outcome.diagnosis : undefined;
      // The headline for people; the technical line (truncated) so a report can say what the chain answered.
      const why = d ? `${diagnosisCopy(d.kind).headline}. ${d.technical.split("\n")[0]!.slice(0, 140)}` : outcome === null ? BACKUP.noSigner : "";
      setError(`${BACKUP.failed} ${why}`.trim());
      return notify.item({ id: "backup", type: "warning", title: BACKUP.failed });
    }
    setPhase("saving");
    const res = await fetch("/api/account/backup-passkey", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentialId: created.id, publicKey: created.publicKey, name: BACKUP.name }) }).catch(() => null);
    setPhase("idle");
    if (!res?.ok) {
      const json = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : {};
      setError(json.message ?? BACKUP.failed);
      return notify.item({ id: "backup", type: "warning", title: json.message ?? BACKUP.failed });
    }
    setCreated(null);
    notify.item({ id: "backup", title: BACKUP.done });
    await Promise.all([qc.invalidateQueries({ queryKey: ["backup-passkeys"] }), qc.invalidateQueries({ queryKey: ["account-keys"] })]);
  };
  if (q.isPending || !data) return null;
  const passkey = data.credentialId !== null;
  const nudge = passkey && hasMoney && data.backups.length === 0;
  const step = created ? 2 : 1;
  return (
    <section id="backup" aria-label={BACKUP.title} className={cn("cx-link", className)}>
      <div className="cx-link-head">
        <span aria-hidden className="cx-link-mark"><KeyRound /></span>
        <span className="cx-link-title">{BACKUP.title}</span>
        <span className="cx-link-sub">{!passkey ? BACKUP.passkeyOnly : data.backups.some((b) => b.credentialId === data.credentialId) ? BACKUP.viaBackup : BACKUP.lead}</span>
      </div>
      {!passkey ? null : (
        <>
          {nudge ? <p role="status" className="cx-link-nudge"><ShieldAlert aria-hidden className="size-4 flex-none" />{BACKUP.nudge}</p> : null}
          {data.backups.length > 0 ? (
            <ul className="cx-link-list">
              {data.backups.map((b) => (
                <li key={b.credentialId}>
                  <span className="type-body-strong text-ink">{b.name ?? BACKUP.name}</span>
                  <span className="numbers type-caption text-ink-secondary">{b.keyId.slice(0, 10)}… · {BACKUP.added(new Date(b.createdAt).toLocaleDateString())}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <StepProgress steps={BACKUP.steps.map((label) => ({ label }))} current={step} onPick={() => undefined} label={BACKUP.title} />
          {error && phase === "idle" ? <p role="alert" className="type-caption text-warning">{error}</p> : null}
          {phase !== "idle" ? <p role="status" className="type-body text-ink-secondary">{BACKUP[phase]}</p> : created ? (
            <>
              <p className="type-body text-ink">{BACKUP.step2}</p>
              <PillButton tone="accent" block onClick={() => void authorise()}>{BACKUP.confirm}</PillButton>
            </>
          ) : (
            <PillButton tone="accent" block onClick={() => void create()}>{BACKUP.add}</PillButton>
          )}
          <p className="cx-link-foot">{BACKUP.fee} {BACKUP.how}</p>
        </>
      )}
    </section>
  );
}
