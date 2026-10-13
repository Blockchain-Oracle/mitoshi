// `/short` (R4-13a, D-227; Owarine 90a91d71's /short): in Mitoshi a short is a Boost on DOWN — the same deployed reserve
// fronts the rest — so the address opens the terminal there (More's "Short" links the same place).
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/components/shell/header/nav-items";

export default function Short() {
  redirect(NAV_ITEMS.short.href);
}
