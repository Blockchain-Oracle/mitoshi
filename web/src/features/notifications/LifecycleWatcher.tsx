"use client";
// Agari 03b30ab:web/src/features/activity/LifecycleWatcher.tsx in purpose (S13 step 6): mounted once in the app shell,
// renders nothing; follows the connected wallet's notifications and says each new one once — a settlement, a void, a
// follower, a take by someone followed. Fills aren't announced here: the terminal already said them as they happened.
import { useEffect } from "react";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { onNewNotices, watchWallet } from "./store";
import { useNoticeTopics } from "./topics";
import { sendNotification } from "@/features/alerts/notifications";

const TOPIC = { filled: "money", won: "money", lost: "money", void: "money", follower: "social", take: "social" } as const;

export function LifecycleWatcher() {
  const { address } = useWalletSession();
  const topics = useNoticeTopics();
  useEffect(() => watchWallet(address ?? null), [address]);
  useEffect(
    () =>
      onNewNotices((items) => {
        for (const n of items.filter((i) => i.kind !== "filled" && topics[TOPIC[i.kind]]).slice(0, 3)) {
          notify.item({ id: `notice-${n.id}`, type: n.kind === "lost" ? "warning" : undefined, title: n.title, ...(n.href ? { action: { label: "View", onClick: () => window.location.assign(n.href!) } } : {}) });
          if (document.visibilityState !== "visible") sendNotification(n.title, "");
        }
      }),
    [topics],
  );
  return null;
}
