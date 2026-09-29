# Third-party notices

This file records the sources and attribution of material this project ports or adapts. It does not grant a license
to the project as a whole, change upstream terms, or imply endorsement by the named projects. File-level notices and
dependency licenses remain applicable.

## Masayume and Agari (the owner's earlier projects)

- **Masayume** (`sommina-events`), pinned commit `68f7a09`: contracts, packages and web app ported from Somnia/DreamDEX
  to Tempo. Ported files carry `Ported from Masayume 68f7a09:<path>`.
- **Agari** (`agari-wt/w1`): the events-engine semantics (reimplemented in Solidity), ops runtime, wallet modal
  replica and venue features. Ported files carry `Agari <sha>:<path>` with the commit actually read.

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
