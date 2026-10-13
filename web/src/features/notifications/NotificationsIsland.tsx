"use client";
// /settings/notifications' island (R4-11, D-227; §3.1, D-071): the settings load after first paint, so the route's first
// load carries none of them. R6 money (S21): the settings outline holds the place under the shell's title and tabs.
import dynamic from "next/dynamic";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { settings as settingsShape } from "@/components/states/shapes/settings";

export const NotificationsIsland = dynamic(() => import("./NotificationSettings").then((m) => m.NotificationSettings), { ssr: false, loading: () => <LoadingFrame shape="settings">{settingsShape()}</LoadingFrame> });
