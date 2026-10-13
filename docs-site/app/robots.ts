import { site } from '@/lib/site';
export default function robots() { return { rules: { userAgent: '*', allow: '/' }, sitemap: `${site.docs}/sitemap.xml` }; }
