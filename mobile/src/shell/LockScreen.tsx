// The Face ID lock screen (round 7; Senryo's returning-user "Continue with Face ID"): over the page while the app is
// locked, asking the system at once and again on a tap. The page keeps running underneath, so it is where it was.
import { useFonts } from "expo-font";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LOCK } from "./copy";
import { palette, SPACE, TYPE, type Mode } from "./theme";

export function Lock({ mode, onUnlock }: { mode: Mode; onUnlock: () => void }) {
  const [fonts] = useFonts({ Sora_700Bold, JetBrainsMono_500Medium });
  const c = palette(mode);
  useEffect(onUnlock, [onUnlock]);
  return (
    <View style={[styles.root, { backgroundColor: c.ground }]} accessibilityViewIsModal>
      <Text style={[styles.title, { color: c.ink }, fonts && styles.titleFace]}>{LOCK.title}</Text>
      <Pressable onPress={onUnlock} accessibilityRole="button" style={({ pressed }) => [styles.unlock, { backgroundColor: c.accent, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.unlockText, { color: c.onAccent }, fonts && styles.unlockFace]}>{LOCK.unlock}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: SPACE.gutter, padding: SPACE.gutter * 1.5 },
  title: { ...TYPE.headline, fontWeight: "700", letterSpacing: -0.26, textAlign: "center" },
  titleFace: { fontFamily: "Sora_700Bold", fontWeight: "normal" },
  unlock: { minHeight: SPACE.touch, minWidth: SPACE.touch * 4, marginTop: SPACE.gutter / 2, paddingHorizontal: 22, borderRadius: SPACE.radius, alignItems: "center", justifyContent: "center" },
  unlockText: { ...TYPE.caption, letterSpacing: 0.78, textTransform: "uppercase", fontWeight: "500" },
  unlockFace: { fontFamily: "JetBrainsMono_500Medium", fontWeight: "normal" },
});
