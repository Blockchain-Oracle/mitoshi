// Saving what a page downloads (D-227, MOBILE): the share card PNG, the account's data export and the record CSV are
// `<a download>` clicks on blob: URLs, which a web view can't hand to the OS. The page's bytes arrive as base64
// (inject.ts); they are written to the app's cache and offered through the system share sheet — Save Image, Files,
// Drive, a chat — which is how a phone saves a file.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { safeFileName } from "./messages";

export async function saveFile(name: string, mime: string, base64: string): Promise<void> {
  const file = new File(Paths.cache, safeFileName(name));
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: "base64" });
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: file.name });
}
