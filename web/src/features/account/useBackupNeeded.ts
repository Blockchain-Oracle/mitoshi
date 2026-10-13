"use client";
// The backup-passkey prompt after the first deposit (D-053): true for a passkey account that holds money and has no
// backup yet. Shares `/api/account/backup-passkey`'s cache with the settings section.
import { useQuery } from "@tanstack/react-query";

/** The backups on record (the settings row's detail); shares the section's cache. Null until read or for a wallet. */
export function useBackupCount(passkey: boolean): number | null {
  const q = useQuery({
    queryKey: ["backup-passkeys"],
    enabled: passkey,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/account/backup-passkey", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`backups ${res.status}`);
      return (await res.json()) as { credentialId: string | null; backups: unknown[] };
    },
  });
  return passkey && q.data ? q.data.backups.length : null;
}

export function useBackupNeeded(passkey: boolean, hasMoney: boolean): boolean {
  const q = useQuery({
    queryKey: ["backup-passkeys"],
    enabled: passkey && hasMoney,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/account/backup-passkey", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`backups ${res.status}`);
      return (await res.json()) as { credentialId: string | null; backups: unknown[] };
    },
  });
  return passkey && hasMoney && q.data !== undefined && q.data.credentialId !== null && q.data.backups.length === 0;
}
