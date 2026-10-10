# Product demo video — shot list (≤ 3:00)

"How the product actually works": the real app on Tempo testnet, end to end, from a fresh account. Recorded as
footage by `web/e2e/footage.ts` on a GitHub runner (`gh workflow run e2e.yml -f driver=footage`, video in the run's
artifact) or by the owner on their own phone; voiced by the owner. Each beat names what is on screen and the line to
say. Keep the cuts honest: no sped-up confirmations, no edited numbers.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:12 | `testnet.mitoshi.xyz` landing → Start trading | "This is Mitoshi on Tempo testnet. One screen for calling where a price closes." |
| 0:12–0:35 | Sign in → passkey sheet → signed up; Add money → testnet dollars land | "Sign-up is a passkey — no seed phrase, no extension. On testnet, Add money mints test dollars." |
| 0:35–0:50 | "Turn on one-tap" → one biometric | "One more biometric publishes an access key with a daily limit. After this, taps don't prompt." |
| 0:50–1:15 | The BTC 5-minute Window: the line, the Line mark, UP pays 1.9× / DOWN pays 2.0×; tap UP → row appears "Confirming on Tempo…" → booked | "UP wins if this Window closes at or above its opening print. One tap — the position is there in under a second." |
| 1:15–1:40 | P&L on the line moves; CLOSE → "Closing…" → "Closed · realized" | "The P&L is what CLOSE pays. One tap sells it back to the book." |
| 1:40–2:05 | Open a position → TP / SL → "Keep exits running with the app closed" | "Set a take-profit or stop-loss and leave. A keeper sells it when it triggers, with the app closed." |
| 2:05–2:30 | Range mode: the band on the chart → Hold to place | "Range: call a band the close lands inside. It prices off the maker vault's depth and pays out of a reserve set aside up front." |
| 2:30–2:50 | History & stats (lifetime P&L, win rate, streaks); a receipt opened on the explorer | "Every trade is on the record, and every row opens its receipt on Tempo." |
| 2:50–3:00 | `/demo` proofs list | "The receipts for all of this are on mitoshi's demo page. See where it's going." |

## Notes

- The settle beat needs a Window to close (up to 5 min): cut it, or record it separately and show the verdict
  ("Paid automatically") on History.
- Testnet only: say "test dollars" once, early.
- If the footage shows "pricing…" for long, RedStone's public gateway is refusing (`/docs/testnet`); re-record later.
