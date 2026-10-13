// The live figures on /demo (R4-13a, D-227; the role of Owarine 90a91d71's DemoPage `LiveNumbers`): the indexer's own
// counts of Moderato's Windows — opened, settled on a print, open now — read per request and kept minutes in memory
// (`landing/figures.ts`), each to /stats where they are recounted. Out of date at worst, never invented; when the index
// can't be read the cards say so.
import { connection } from "next/server";
import Link from "next/link";
import { landingFigures } from "@/features/landing/figures";
import { DEMO } from "./copy";

const count = new Intl.NumberFormat("en-US");

function Figures({ values }: { values: { opened: string; resolved: string; open: string } | null }) {
  const L = DEMO.live;
  const items = [
    { label: L.opened, value: values?.opened },
    { label: L.resolved, value: values?.resolved },
    { label: L.open, value: values?.open },
  ];
  return (
    <dl className="demo-figures">
      {items.map((item) => (
        <Link key={item.label} href="/stats" className="demo-figure">
          <dt className="demo-figure-label">{item.label}</dt>
          <dd className="demo-figure-value">{item.value ?? L.reading}</dd>
        </Link>
      ))}
    </dl>
  );
}

export function DemoTractionWait() {
  return <div className="demo-figures" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="demo-figure skel" />)}</div>;
}

export async function DemoTraction() {
  await connection();
  const f = await landingFigures();
  return <Figures values={f ? { opened: count.format(f.windowsOpened), resolved: count.format(f.windowsResolved), open: count.format(f.windowsOpen) } : null} />;
}
