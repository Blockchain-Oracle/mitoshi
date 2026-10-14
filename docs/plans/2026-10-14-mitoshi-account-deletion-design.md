# Mitoshi account deletion

Approved on 2026-10-14: add signed self-service account deletion, separate from the existing off-chain data deletion. Google Play asks for both an in-app path and a public web URL for accounts created in the app.

## User path

- Keep **Delete your Mitoshi data** for someone who wants to erase off-chain posts and profile data while keeping the account.
- Add **Delete Mitoshi account** in Settings → Account. The confirmation names the wallet address, asks the user to type DELETE, requires a fresh wallet signature, and retains the existing five-second Undo window.
- Publish `/delete-account` without sign-in. It explains the in-app/web steps, links directly to Settings → Account, offers a contact route when sign-in is unavailable, and lists data erased and retained. Use this as Play's Delete account URL.
- A successful deletion signs out the browser and reports the result. A failure does not claim that the account was deleted.

## Server behavior

- Verify the current account session and the fresh signed deletion message before any mutation, using the same network/address/signature checks as the existing data deletion route. The shared Play reviewer account cannot delete the shared account.
- Erase account-owned off-chain records and primary/backup passkey credential registrations. Remove backup mappings and any app-owned identity links; revoke the current session. Other existing sessions must fail after their credential registration is gone.
- If a wallet account rather than a passkey was used, erase the account's off-chain data and sessions but do not claim to delete the external wallet. Reusing that wallet starts a new Mitoshi profile.
- Keep on-chain Tempo transactions and addresses, plus chain-derived public indexes, because the blockchain cannot erase them. Keep bounded anti-abuse and operational records only where needed, and disclose those categories and retention plainly.

## Verification

- Test rejection for missing session, wrong address, stale text, bad signature, and reviewer session. Test successful deletion of a fresh passkey account with a backup credential, plus invalidation of pre-existing sessions. Check `/delete-account` at phone width and the Play form URL before submitting Data safety.
