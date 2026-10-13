// `/native-auth` (S11 with SM2's handoff, D-227): in the system browser (`?handoff=`), one tap hands the X sign-in back
// to the app on its own scheme; in the app's web view (`?code=`), the code and the web view's PKCE verifier become the
// X session. Opened without either, it says what it is for.
import { NativeAuthIsland } from "@/features/x/XIsland";

export const metadata = { title: "Back to the app" };

export default function NativeAuthPage() {
  return <NativeAuthIsland />;
}
