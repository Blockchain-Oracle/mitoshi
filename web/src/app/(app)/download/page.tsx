// `/download` — the place to get the app (D-230): iPhone, Android and the web app (`features/install`). The cards read
// the store links and the device per request, inside the page's own Suspense; the head is static.
import type { Metadata } from "next";
import { DOWNLOAD } from "@/features/install";
import { DownloadPage } from "@/features/install/DownloadPage";

export const metadata: Metadata = { title: DOWNLOAD.title, description: DOWNLOAD.description };

export default function Download() {
  return <DownloadPage />;
}
