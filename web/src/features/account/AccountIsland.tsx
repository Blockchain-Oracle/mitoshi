"use client";
// /settings/account's island (R4-11, D-227; §3.1, D-071): the grouped lists and their sheets load after first paint, so
// the route's first load carries none of them. R6 money (S21): the place is held by the settings outline (two grouped
// lists of rows) under the shell's server-drawn title and tabs. The Device tab's island lives here too.
import dynamic from "next/dynamic";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { settings as settingsShape } from "@/components/states/shapes/settings";

const Loading = () => <LoadingFrame shape="settings">{settingsShape()}</LoadingFrame>;

export const AccountIsland = dynamic(() => import("./AccountSettings").then((m) => m.AccountSettings), { ssr: false, loading: Loading });
export const DeviceIsland = dynamic(() => import("./DeviceSettings").then((m) => m.DeviceSettings), { ssr: false, loading: Loading });
export { Loading as SettingsLoading };
