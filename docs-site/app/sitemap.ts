import { source } from '@/lib/source';
import { site } from '@/lib/site';
export default function sitemap() { return source.getPages().map(page => ({ url: new URL(page.url, site.docs).toString(), lastModified: site.reviewed })); }
