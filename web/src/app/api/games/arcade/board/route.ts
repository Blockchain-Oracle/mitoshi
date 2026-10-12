// `GET /api/games/arcade/board` (P4, D-223): Mitoshi keeps no arcade scores yet (the score replay server lands with
// the game room, S12b), and says so — `configured: false`, no rows, and a fresh seed for the next run from the server's
// own entropy, as the board always hands out. Every run's best stays on the device.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return NextResponse.json({ configured: false, seed: randomBytes(16).toString("hex"), engineVersion: 1, rows: [], me: null }, { headers: { "cache-control": "no-store" } });
}
