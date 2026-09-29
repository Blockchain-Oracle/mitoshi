/** Browser/native-safe relay helpers: read the relay's public status (used by `/status` and the settings trust surface). */
import type { RelayStatus } from "./status";

export async function fetchRelayStatus(baseUrl = "/api/relay", init?: RequestInit): Promise<RelayStatus> {
  const res = await fetch(`${baseUrl}/status`, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`relay status ${res.status}`);
  return (await res.json()) as RelayStatus;
}
