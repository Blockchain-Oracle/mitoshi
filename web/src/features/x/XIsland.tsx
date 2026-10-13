"use client";
// S11 (D-227): the X screens load after first paint (§3.1, D-071), so the routes' first load carries none of them; a
// page-shaped placeholder holds the place — as /settings/account's island does (R4-11). They read through TanStack
// Query, whose client arrives with the late data layer, so each waits for `useDataReady()` as /earn does: a
// screen whose chunk landed first threw "No QueryClient set" into the error page (the ship's live check, F-S11-09).
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { useDataReady } from "@/providers/data/context";

const READING = "Reading X";
const TradeFromXScreen = dynamic(() => import("./TradeFromXScreen").then((m) => m.TradeFromXScreen), { ssr: false, loading: () => <LoadingState shape="page" label={READING} /> });
const ClaimScreen = dynamic(() => import("./ClaimScreen").then((m) => m.ClaimScreen), { ssr: false, loading: () => <LoadingState shape="page" label={READING} /> });
const NativeAuthScreen = dynamic(() => import("./NativeAuthScreen").then((m) => m.NativeAuthScreen), { ssr: false, loading: () => <LoadingState shape="page" label="Finishing sign-in" /> });
const GoScreen = dynamic(() => import("./GoScreen").then((m) => m.GoScreen), { ssr: false, loading: () => <LoadingState shape="page" label="Opening the call" /> });

function whenDataReady(Screen: ComponentType, label: string): ComponentType {
  return function XIsland() {
    return useDataReady() ? <Screen /> : <LoadingState shape="page" label={label} />;
  };
}

export const TradeFromXIsland = whenDataReady(TradeFromXScreen, READING);
export const ClaimIsland = whenDataReady(ClaimScreen, READING);
export const NativeAuthIsland = whenDataReady(NativeAuthScreen, "Finishing sign-in");
export const GoIsland = whenDataReady(GoScreen, "Opening the call");
