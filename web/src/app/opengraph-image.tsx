// The site's link preview (S5, L-23): the wordmark, the landing's line and three marks (`features/og`).
import { OG_COPY } from "@/features/og/copy";
import { siteImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.site.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return siteImage();
}
