"use client";
// /settings/notifications' island (R4-11, D-227; §3.1, D-071): the settings load after first paint, so the route's first
// load carries none of them; a list-shaped placeholder holds the place.
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states/LoadingState";

export const NotificationsIsland = dynamic(() => import("./NotificationSettings").then((m) => m.NotificationSettings), { ssr: false, loading: () => <LoadingState shape="page" label="Reading your notifications" /> });
