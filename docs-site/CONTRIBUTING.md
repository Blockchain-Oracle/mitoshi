# Contributing to Mitoshi Docs

The guides describe what runs, not what is planned. Every claim is checked against the app's code, its deployment
fragments and its acceptance records (`docs/plan/acceptance/`) before it is written.

1. Edit `content/docs/**/*.mdx`; add new pages to their folder's `meta.json`. List the app files a page was checked
   against in its `sources` front matter.
2. Link guides with `/section/page`, app routes with `<AppLink href="/route">`, transactions with `<Tx hash="0x…" />`
   and addresses with `<Address address="0x…" />`. Cite a full hash only if an acceptance record holds it in full.
3. Keep testnet and mainnet apart. A deployed contract is not a live screen; a fork test is not a live run. Say which.
4. Copy at the app's word count or fewer. Dates are written out ("12 October 2026").
5. When the app advances, `pnpm check` lists the commits since `site.revision`: read them, update the guides they touch,
   then advance `revision` and `reviewed` in `lib/site.ts`. Never advance the pin to silence the warning.
6. After a deployment changes, run `pnpm sync:deployments`; after `lib/architecture.json` changes, `pnpm diagrams`.
7. Captures come only from the deployed product, copied unmodified with their SHA-256 in `public/captures/`.
