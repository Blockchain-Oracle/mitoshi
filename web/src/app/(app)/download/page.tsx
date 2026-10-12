// Ported from Masayume 68f7a09:web/src/app/download/page.tsx — the install page (L-18), truth-corrected for Mitoshi.
import { DownloadPage } from "@/features/install";
import { INSTALL } from "@/features/install/copy";

export const metadata = { title: INSTALL.title };

export default function Download() {
  return <DownloadPage />;
}
