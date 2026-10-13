# Receipt card font assets

Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/reply-card-assets (S11, D-227). The card renderer
(`../reply-card.ts`) turns the receipt's validated text into SVG paths with these two static fonts. It requests no
font or image from a network and calls no generative model. `sharp` converts the SVG to a 1200 × 600 PNG.

| File | Source / instance | SHA-256 |
| --- | --- | --- |
| `Sora-SemiBold.ttf` | Sora variable, `wght=600` | `198f1e07ca73dd53b4cafc7a43835c16a799dca4435feda18fa4158617db48bc` |
| `Inter-Regular.ttf` | Inter variable, `wght=400`, `opsz=14` | `0b59f6b6fc9e8a9ad8032802d1797c4237d9288a3e7b7661517070627b577060` |

Owarine copied them from the reviewed `masayume-docs/scripts/assets/fonts` package on 2026-09-05. The upstream is
Google Fonts revision [`5e35378e6bda803962ee6fd257e444a7d459660d`](https://github.com/google/fonts/tree/5e35378e6bda803962ee6fd257e444a7d459660d):
`ofl/sora/Sora[wght].ttf` and `ofl/inter/Inter[opsz,wght].ttf`, instanced with `fonttools 4.64.0 varLib.instancer`.
The hashes above were checked again on 2026-10-13. Each font's SIL Open Font License is beside it.

Sora and Inter are the web's display and body faces (`web/src/lib/fonts.ts`). The card draws the mark from
`web/src/components/shell/MitoshiMark.tsx`, path for path, and takes its colours from `@cwf/tokens`. The cream receipt
is an original vector drawing. It is not a bank or payout proof. A check means the order filled, never that the call
won.

`renderReplyCardPng(presentation, { demo: true })` is for review fixtures only. The relay renders the formatter's
presentation with the default options. The renderer never posts, uploads, places a trade or decides whether a reply
may go out.

The PNG has no alt text: the SVG's labels do not survive conversion, and the transport cannot attach alt text. So the
plain-text reply always carries every fact on the card.
