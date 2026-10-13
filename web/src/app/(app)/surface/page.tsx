// /surface — S10e replaces the registered pending page with the live surface (Masayume 68f7a09:web/src/app/surface/
// page.tsx). A static shell; the lanes, books, model and price paths stream in client-side after first paint (D-071).
import { SurfacePage } from "@/features/surface/SurfacePage";

export const metadata = { title: "Market Surface", description: "Every Window's book at a glance." };

export default function Page() {
  return <SurfacePage />;
}
