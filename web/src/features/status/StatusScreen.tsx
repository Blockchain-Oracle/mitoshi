// `/status` (S5, L-16; R4-10, D-227: Owarine 90a91d71's board, out of the docs frame): read once on the server so the
// board paints with its verdict, then re-read by the board every 30 s.
import { connection } from "next/server";
import { readStatus } from "./probes";
import { StatusBoard } from "./StatusBoard";

export async function StatusScreen() {
  await connection();
  return <StatusBoard initial={await readStatus()} />;
}
