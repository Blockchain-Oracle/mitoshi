// Face ID to open Mitoshi (round 7; Senryo's "Continue with Face ID"): an optional app lock, offered at the end of
// onboarding and in Settings (the page posts `face-id {enabled}`). On only after one successful Face ID, so it can't
// lock someone out of a device without biometrics; kept in the Keychain, never in the page's storage.
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const KEY = "mitoshi.faceIdLock";
/** Back from the background after this long, the lock asks again. */
export const RELOCK_AFTER_MS = 60_000;

export async function lockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === "1";
  } catch {
    return false;
  }
}

export async function biometricsReady(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

/** The system prompt; true when the owner of the phone passed it. */
export async function authenticate(prompt: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: "Cancel" });
    return result.success;
  } catch {
    return false;
  }
}

/** Turning it on asks for Face ID once; turning it off doesn't. Resolves to the setting as it now stands. */
export async function setLock(enabled: boolean, prompt: string): Promise<boolean> {
  try {
    if (!enabled) {
      await SecureStore.deleteItemAsync(KEY);
      return false;
    }
    if (!(await biometricsReady()) || !(await authenticate(prompt))) return lockEnabled();
    await SecureStore.setItemAsync(KEY, "1");
    return true;
  } catch {
    return lockEnabled();
  }
}
