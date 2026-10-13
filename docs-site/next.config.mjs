// Ported from Owarine 90a91d71:docs-site/next.config.mjs (D-227). `agentRules: false` keeps Next from writing agent files.
import { createMDX } from 'fumadocs-mdx/next';
const withMDX = createMDX();

/** The retired name (D-228): it sends every path, query kept, to the docs' own host once that host is another one. */
const RETIRED = 'docs.testnet.mitoshi.xyz';
const docs = new URL(process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.mitoshi.xyz');

export default withMDX({
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  redirects: async () =>
    docs.host === RETIRED ? [] : [{ source: '/:path*', has: [{ type: 'host', value: RETIRED }], destination: `${docs.origin}/:path*`, statusCode: 301 }],
});
