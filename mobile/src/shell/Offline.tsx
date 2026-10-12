// The offline screen (D-227, MOBILE; docs/specs/mobile.md D.2 "native offline screen with retry"). Ported from the
// web's error boundary (web/src/components/states/BoundaryScreen.tsx + styles/error.css): centred, calm, the title in
// the heading face, the body in the secondary ink, one vermilion Retry in the data face. It comes back on its own when
// the connection does (Shell.tsx).
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OFFLINE } from "./copy";
import { palette, SPACE, TYPE, type Mode } from "./theme";

export type OfflineKind = "offline" | "down";

export function Offline({ kind, mode, retrying, onRetry }: { kind: OfflineKind; mode: Mode; retrying: boolean; onRetry: () => void }) {
  const [fonts] = useFonts({ Sora_700Bold, Inter_400Regular, JetBrainsMono_500Medium });
  const c = palette(mode);
  const words = OFFLINE[kind];
  return (
    <View style={[styles.root, { backgroundColor: c.ground }]} accessibilityRole="alert">
      <Text style={[styles.title, { color: c.ink }, fonts && styles.titleFace]}>{words.title}</Text>
      <Text style={[styles.body, { color: c.muted }, fonts && styles.bodyFace]}>{words.body}</Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityState={{ busy: retrying }}
        style={({ pressed }) => [styles.retry, { backgroundColor: c.accent, opacity: pressed || retrying ? 0.7 : 1 }]}
      >
        <Text style={[styles.retryText, { color: c.onAccent }, fonts && styles.retryFace]}>{retrying ? OFFLINE.retrying : OFFLINE.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: SPACE.gutter, padding: SPACE.gutter * 1.5 },
  title: { ...TYPE.headline, fontWeight: "700", letterSpacing: -0.26, textAlign: "center" },
  titleFace: { fontFamily: "Sora_700Bold", fontWeight: "normal" },
  body: { ...TYPE.body, maxWidth: 440, textAlign: "center" },
  bodyFace: { fontFamily: "Inter_400Regular" },
  retry: { minHeight: SPACE.touch, minWidth: SPACE.touch * 3, marginTop: SPACE.gutter / 2, paddingHorizontal: 22, borderRadius: SPACE.radius, alignItems: "center", justifyContent: "center" },
  retryText: { ...TYPE.caption, letterSpacing: 0.78, textTransform: "uppercase", fontWeight: "500" },
  retryFace: { fontFamily: "JetBrainsMono_500Medium", fontWeight: "normal" },
});
