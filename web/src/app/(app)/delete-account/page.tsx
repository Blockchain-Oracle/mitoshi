import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { LegalScreen } from "@/features/legal/LegalScreen";

export const metadata: Metadata = { title: "Delete Mitoshi account", description: "How to request deletion of your Mitoshi account and associated data." };

export default function DeleteAccountPage() {
  return <LegalScreen
    heading="Delete your Mitoshi account"
    lede="You can request deletion in Mitoshi, whether you installed the app or use the website."
    facts={["Signed request", "Five seconds to undo", "Tempo history stays public"]}
    sections={[
      {
        id: "steps", title: "How to delete", gist: "Sign in, then choose Delete Mitoshi account.", icon: <KeyRound />,
        points: [
          <>Open <Link href="/settings/account">Settings → Account</Link> in Mitoshi. Sign in with the original passkey or the wallet for the account you want to delete.</>,
          <>Under Your data, choose <b>Delete Mitoshi account</b>. Type DELETE, hold to confirm, then sign the fresh deletion request. You can undo it for five seconds.</>,
          <>If you cannot sign in, use the <Link href="/contact">contact form</Link> to request help. Include your Mitoshi wallet address and a way to reach you; do not send a private key, passkey, password or recovery phrase.</>,
        ],
      },
      {
        id: "erased", title: "What Mitoshi removes", gist: "Sign-in records and data you created in Mitoshi.", icon: <ShieldCheck />,
        points: [
          <>Mitoshi removes its registered passkey credentials and backup mappings, so their existing Mitoshi sessions stop working. Your device may still list the passkey; remove it in your device password manager if you wish.</>,
          <>Mitoshi removes your profile, posts, room messages, reactions, follows, blocks, reports, game profile and scores, signed-in contact messages, X account link and instructions, and authored strategy text.</>,
          <>If you used an external wallet, Mitoshi cannot delete that wallet. Its Mitoshi profile and sessions are removed; signing in again can start a new profile.</>,
        ],
      },
      {
        id: "retained", title: "What remains", gist: "Public chain records and limited operational records.", icon: <Wallet />,
        points: [
          <>Your Tempo address and transactions cannot be erased from the blockchain. Mitoshi may continue to index those public records, including trades and positions.</>,
          <>Fee sponsorship, faucet and anti-abuse records may be kept to enforce testnet limits and investigate misuse. An account-closure marker is held for 31 days to invalidate older sessions, then expires.</>,
        ],
      },
    ]}
  />;
}
