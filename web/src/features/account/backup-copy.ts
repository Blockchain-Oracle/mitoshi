// `/settings/account` → Backup passkey (S13 step 10, D-053): the words.
export const BACKUP = {
  title: "Backup passkey",
  lead: "Your account is one passkey. Add a second on another device or a security key, and losing a phone doesn't lose the account.",
  how: "The backup becomes an admin key of this account on Tempo. On a new device, choose \"I already have one — sign in\" and pick the backup: you sign in as this account.",
  fee: "Adding it is one transaction your account pays a network fee for (a fraction of a cent); the relay doesn't sponsor key authority.",
  nudge: "You have money on this account and only one passkey.",
  none: "No backup yet.",
  added: (when: string) => `Added ${when}`,
  add: "Add a backup passkey",
  creating: "Create the backup on the other device or security key…",
  authorising: "Confirm with this passkey…",
  saving: "Saving the backup…",
  done: "Backup added. Keep that device or key safe: it can sign in as this account.",
  cancelled: "No backup was added.",
  failed: "The backup couldn't be added. Nothing changed on your account.",
  passkeyOnly: "Backups are for passkey accounts. A wallet account is backed up by the wallet's own recovery phrase.",
  name: "Mitoshi backup",
} as const;
