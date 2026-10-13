// `/settings/device` (R6 money, S21; D-230): this device's settings — Sound & Vibration, Privacy, Region — usable signed
// out, split from the account page.
import { DeviceIsland } from "@/features/account/AccountIsland";

export const metadata = { title: "Device" };

export default function DeviceSettingsPage() {
  return <DeviceIsland />;
}
