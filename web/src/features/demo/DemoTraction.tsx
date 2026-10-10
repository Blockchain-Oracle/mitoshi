// The traction line under the hero (Masayume 68f7a09:web/src/features/demo/DemoTraction.tsx's role): the indexer's own
// counts of Moderato's Windows, read per request and kept minutes in memory (`landing/figures.ts`) — out of date at
// worst, never invented. Nothing is shown when the index can't be read.
import { Fragment } from "react";
import { connection } from "next/server";
import { landingFigures } from "@/features/landing/figures";
import { DEMO } from "./copy";

const count = new Intl.NumberFormat("en-US");

export async function DemoTraction() {
  await connection();
  const f = await landingFigures();
  if (!f) return null;
  const items = [DEMO.traction.opened(count.format(f.windowsOpened)), DEMO.traction.resolved(count.format(f.windowsResolved)), DEMO.traction.live];
  return (
    <div className="demo-traction">
      {items.map((item, index) => (
        <Fragment key={item}>
          {index > 0 ? <span className="demo-traction-dot" aria-hidden>·</span> : null}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  );
}
