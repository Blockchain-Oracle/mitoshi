// /settings has no page of its own: the back chevron on /settings/* lands here, so it goes to the account (R4-11, D-227).
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/account");
}
