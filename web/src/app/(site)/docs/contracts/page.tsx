// /docs/contracts — what is deployed on Moderato, from the generated deployments the app itself reads (S20, L-20).
import type { Metadata } from "next";
import { deployments } from "@cwf/clients";
import { addressUrl } from "@cwf/core/urls";
import { A, Code, H1, Lead, P, Table } from "@/features/docs/Prose";

export const metadata: Metadata = { title: "Contracts on Moderato" };

type Deployed = Record<string, { contracts: Record<string, { address: string; deployBlock?: number }> }>;
const MODERATO = (deployments as unknown as Record<string, Deployed>)["42431"] ?? {};

/** The areas a reader of the live product meets, in the order they meet them. */
const AREAS: readonly [string, string][] = [
  ["engine", "The market engine: books, Windows, prints"],
  ["fair", "The fair-value guard the games price against"],
  ["maker", "The maker vault"],
  ["vault2", "The Trading Balance"],
  ["range", "Range and Moonshot"],
  ["parlay", "Parlay"],
  ["leverage", "Boost"],
  ["private", "The private desk"],
];

export default function Page() {
  const rows = AREAS.flatMap(([area, what]) =>
    Object.entries(MODERATO[area]?.contracts ?? {}).map(([name, c]) => [
      <span key="n"><b>{name}</b><br /><span className="type-caption text-ink-secondary">{what}</span></span>,
      <A key="a" href={addressUrl(c.address as `0x${string}`, "testnet")}><Code>{c.address}</Code></A>,
    ]),
  );
  return (
    <>
      <H1>Contracts on Moderato</H1>
      <Lead>Every address Mitoshi&apos;s live product calls on Tempo testnet (chain 42431), each linked to the explorer.</Lead>
      <P>The list is read from the same generated deployments file the app uses, so it can&apos;t drift from what the product calls. The stock pools, their guard, the launchpads and the bridge are deployed too; their screens are next.</P>
      <Table head={["Contract", "Address"]} rows={rows} />
    </>
  );
}
