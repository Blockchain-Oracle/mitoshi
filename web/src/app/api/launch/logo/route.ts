// `POST /api/launch/logo` (S17; R4-11, D-227): a launch's logo, before anything is signed. A PNG, JPEG or WebP of at most
// 256 KB, square, 64–2048 px a side (read from its own header, `server/image-size.ts`), stored once by the sha256 of its
// bytes; the answer is the URL the token's `logoURI` carries (well under the TIP-20's 256 bytes). An address may post
// twenty an hour. Sign-in is not asked: the launch's own signature comes at the end (the CTA is the action).
import { createHash } from "node:crypto";
import { createPgLaunchLogos } from "@cwf/db";
import { clientIp } from "@/features/sensei/rate.server";
import { db } from "@/server/db";
import { imageSize } from "@/server/image-size";

const MAX_BYTES = 256 * 1024;
const MIN_SIDE = 64;
const MAX_SIDE = 2048;
const PER_HOUR = 20;
const HOUR_MS = 3_600_000;
const posted = new Map<string, number[]>();

function allowed(ip: string, nowMs: number): boolean {
  const recent = (posted.get(ip) ?? []).filter((t) => nowMs - t < HOUR_MS);
  if (recent.length >= PER_HOUR) return false;
  posted.set(ip, [...recent, nowMs]);
  if (posted.size > 5_000) for (const [k, v] of posted) if (nowMs - (v.at(-1) ?? 0) >= HOUR_MS) posted.delete(k);
  return true;
}

const refuse = (status: number, message: string) => Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return refuse(400, "Choose an image.");
  if (file.size > MAX_BYTES) return refuse(413, "Up to 256 KB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = imageSize(bytes);
  if (!size) return refuse(415, "PNG, JPEG or WebP only.");
  if (size.width !== size.height) return refuse(422, "The logo must be square.");
  if (size.width < MIN_SIDE || size.width > MAX_SIDE) return refuse(422, "64 to 2048 px a side.");
  if (!allowed(clientIp(req), Date.now())) return refuse(429, "Too many logos. Try again in an hour.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await createPgLaunchLogos(db()).put({ sha256, contentType: size.type, bytes, width: size.width, height: size.height });
  } catch {
    return refuse(503, "The logo couldn't be saved. Try again.");
  }
  const origin = new URL(req.url).origin;
  const forwarded = req.headers.get("x-forwarded-host");
  const base = forwarded ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${forwarded}` : origin;
  return Response.json({ sha256, url: `${base}/api/launch/logo/${sha256}`, width: size.width }, { headers: { "cache-control": "no-store" } });
}
