// `/activity` — the inbox (S13 step 6, filed under Portfolio with the rail's badge); Owarine 90a91d71's ActivityScreen
// frame since R4-10 (D-227). R6 money (T10, D-230): signed out it shows the public settlement feed, read on the server at
// request time (minutes-cached, shared) and streamed in under the page's own frame.
import { connection } from "next/server";
import { Suspense } from "react";
import { NotificationCentre } from "@/features/notifications/NotificationCentre";
import { publicFeed } from "@/features/notifications/public-feed.server";

export const metadata = { title: "Activity" };

async function WithFeed() {
  await connection();
  return <NotificationCentre feed={await publicFeed()} />;
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<NotificationCentre />}>
      <WithFeed />
    </Suspense>
  );
}
