"use client";
// The report dialog off every first load (S13): it mounts only after "Report" is tapped, so its chunk loads then.
import dynamic from "next/dynamic";

export const ReportDialog = dynamic(() => import("./ReportDialog").then((m) => m.ReportDialog), { ssr: false });
