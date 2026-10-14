// R6 landing L19: crawl the site, not its APIs or the dev routes; the sitemap on the deployment's own origin.
import type { MetadataRoute } from "next";
import { webEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dev/"] }],
    sitemap: `${webEnv.appOrigin}/sitemap.xml`,
    host: webEnv.appOrigin,
  };
}
