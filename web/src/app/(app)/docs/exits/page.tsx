// /docs/exits — CLOSE, Reduce, and exits that run with the app closed (S20, L-20; D-193, D-194, D-197).
import type { Metadata } from "next";
import { A, H1, H2, Lead, Note, P, Ul } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Closing and exits" };

export default function Page() {
  return (
    <>
      <H1>Closing and exits</H1>
      <Lead>Close by hand, or set exits and walk away.</Lead>
      <H2>CLOSE and Reduce</H2>
      <P>CLOSE sells your whole position back to the Window&apos;s book in one tap, at what the position shows — or a little below it, within the close tolerance in Trade settings. Reduce sells 25, 50 or 75 % of it. If the book has moved further than that, the sale asks again at the new price rather than fill worse. &ldquo;Closing…&rdquo; shows the instant the sale is signed.</P>
      <H2>Take-profit, stop-loss, trailing</H2>
      <Ul
        items={[
          <><b>Take-profit</b> sells when what CLOSE pays rises to your target.</>,
          <><b>Stop-loss</b> sells when it falls to your floor.</>,
          <><b>Trailing</b> arms once the price is the trailing distance past break-even; its stop only moves your way, and it closes when the price comes back to it.</>,
        ]}
      />
      <H2>With the app closed</H2>
      <P>On a Trading Balance position, one biometric grants Mitoshi&apos;s keeper an EXIT permission: it can only sell positions the Trading Balance holds, at or above a floor, back into the Trading Balance. When an exit triggers, the keeper sells it whether your tab is open or not. If no bid meets the floor, it waits and tries again rather than sell lower.</P>
      <P>The house keeps its side of these exits open until 30 seconds before the Window closes. Every grant is listed in Settings and lasts 30 days; Stop revokes it on chain.</P>
      <Note>An exit fills only against a real bid. <A href="/demo">See one sell</A>.</Note>
    </>
  );
}
