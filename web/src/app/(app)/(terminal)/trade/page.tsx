// `/trade` (D-192): the proxy sends it to the last symbol traded in this browser (`cwf.trade`), else BTC; this page is
// the same answer for anything that reaches it without the proxy.
import { redirect } from "next/navigation";
import { DEFAULT_TRADE_SYMBOL } from "@/features/terminal/route";

export default function TradeIndex() {
  redirect(`/trade/${DEFAULT_TRADE_SYMBOL}`);
}
