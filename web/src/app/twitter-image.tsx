// The X card (S5, Y-14): the same image as the Open Graph preview, at the same 1200 × 630.
import { OG_COPY } from "@/features/og/copy";
import { siteImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.site.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return siteImage();
}
