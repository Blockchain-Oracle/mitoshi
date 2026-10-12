# Third-party notices

This file records the sources and attribution of material this project ports or adapts. It does not grant a license
to the project as a whole, change upstream terms, or imply endorsement by the named projects. File-level notices and
dependency licenses remain applicable.

## Masayume and Agari (the owner's earlier projects)

- **Masayume** (`sommina-events`), pinned commit `68f7a09`: contracts, packages and web app ported from Somnia/DreamDEX
  to Tempo. Ported files carry `Ported from Masayume 68f7a09:<path>`.
- **Agari** (`agari-wt/w1`): the events-engine semantics (reimplemented in Solidity), ops runtime, wallet modal
  replica and venue features. Ported files carry `Agari <sha>:<path>` with the commit actually read.
- **Owarine** (`owarine`, MIT, © 2026 Abubakr Jimoh), pinned commit `ecb7565b`: the Tradash-behaviour trading terminal
  (canvas chart engine, synthesised trade cues and music, haptics, reactions, terminal screens) and the display price
  feed (exchange spot, candles, day stats, coalescer), ported for the 2026-10-08 revamp (D-198). Ported files carry
  `Ported from Owarine ecb7565b:<path>`. Owarine's own notices (Agari lineage, Fluent Emoji MIT, Kenney CC0 flow clips)
  apply to the files they cover; no Kenney audio is ported.
- **Baku** (`roy-chain`, MIT, © 2026 Abubakr Jimoh), pinned commit `ede3ed38`: the app shell (rail, top line, stage,
  phone dock, drawer geometry, keyboard map) measured from the Slush wallet's structure, ported for the revamp
  (D-198). Ported files carry `Ported from Baku (roy-chain) ede3ed38:<path>`; Baku's rail credits 21st.dev 21517
  (unlumen/animated-sidebar), registered in `docs/design/components.md`.

## Tradash (behaviour reference only)

The terminal's behaviour, motion and sound follow tradash.xyz as observed live and in its shipped bundle (7–8 Oct
2026). Tradash publishes no source and no licence, so nothing of theirs — code, CSS, images or audio — is copied:
constants and algorithms are re-implemented, and the six trade cues are synthesised to measured pitch contours.

## Yosuku product and presentation (inherited through Masayume)

Masayume includes source-led adaptations of Yosuku's interface, styles and product wording
([Cybire1/yosuku](https://github.com/Cybire1/yosuku) @ `3c56ef52b78dae28cc198495f753480292f6a5ad`). Masayume's own
notice records the owner's approval of that reuse and the open questions about public redistribution; they carry over
unchanged. The repository stays private until Q-015 (the Yosuku CSS licence) is answered.

## 21st.dev components

UI components adopted from the 21st.dev registry carry `From 21st.dev <id> <author/slug>` and are listed in
`docs/design/components.md` with what was changed. Each component's own license (shown on its registry page) applies.

## Fonts

Font licenses (SIL Open Font License 1.1 unless noted) are recorded beside each font file or in `web/src/lib/fonts.ts`
when the fonts are ported (S1). Font licenses do not become the license of the application.

## Uniswap v4

Moderato's v4 contracts are byte-identical replays of Uniswap Labs' mainnet deployments (BUSL-1.1 permits testnet use);
only MIT-licensed interfaces and libraries are compiled here. See `docs/specs/v4-replay.md`.

## Sign-in modal (O-9, D-222)

The compact sign-in frame (`web/src/providers/wallet/{wallet-modal-parts.tsx,wallet-modal.css}`) is ported from Owarine
90a91d71 (the owner's own MIT repo), which replicates the RainbowKit 2.2.11 modals Masayume shipped:

- **RainbowKit** ([rainbow-me/rainbowkit](https://github.com/rainbow-me/rainbowkit), MIT, Copyright (c) 2024 Rainbow): the close, back and spinner glyph paths and the two "What is a Wallet?" illustrations (`web/public/wallet/assets.svg`, `login.svg`).

## Asset marks (O-1, D-222)

The discs that name a listed asset (`web/src/components/icons/asset-marks/`) carry the issuer's mark as inline SVG path data, vendored so nothing is fetched at runtime. The marks and names are trademarks of their owners; they identify the traded assets and imply no endorsement of, or affiliation with, Mitoshi.

| Mark | Source | Terms |
| --- | --- | --- |
| Tesla, NVIDIA, Apple, Meta, Google, SpaceX, Solana, AMD, Palantir | [simple-icons](https://github.com/simple-icons/simple-icons) **16.31.0** (`icons/<slug>.svg`) | CC0 1.0 Universal |
| Amazon | simple-icons **14.15.0**, the last release to carry `amazon.svg` | CC0 1.0 at publication (removed in 15.0.0 by the maintainers pending permission, not on a request from Amazon) |
| Microsoft | Own geometry: four rectangles in `paths.ts`; no third-party artwork | — |
| Bitcoin, Ethereum | Masayume's own marks | — |
