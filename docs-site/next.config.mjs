// Ported from Owarine 90a91d71:docs-site/next.config.mjs (D-227). `agentRules: false` keeps Next from writing agent files.
import { createMDX } from 'fumadocs-mdx/next';
const withMDX = createMDX();

export default withMDX({
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
});
