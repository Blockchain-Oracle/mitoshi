"use client";
// S11 (D-227): the X screens load after first paint (§3.1, D-071), so the routes' first load carries none of them; a
// page-shaped placeholder holds the place — as /settings/account's island does (R4-11).
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states/LoadingState";

export const TradeFromXIsland = dynamic(() => import("./TradeFromXScreen").then((m) => m.TradeFromXScreen), { ssr: false, loading: () => <LoadingState shape="page" label="Reading X" /> });
export const ClaimIsland = dynamic(() => import("./ClaimScreen").then((m) => m.ClaimScreen), { ssr: false, loading: () => <LoadingState shape="page" label="Reading X" /> });
export const NativeAuthIsland = dynamic(() => import("./NativeAuthScreen").then((m) => m.NativeAuthScreen), { ssr: false, loading: () => <LoadingState shape="page" label="Finishing sign-in" /> });
export const GoIsland = dynamic(() => import("./GoScreen").then((m) => m.GoScreen), { ssr: false, loading: () => <LoadingState shape="page" label="Opening the call" /> });
