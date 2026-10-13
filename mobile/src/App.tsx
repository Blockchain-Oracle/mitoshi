// The app's root (D-227, MOBILE): the safe-area context and the one web view (src/shell/Shell.tsx).
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Shell } from "./shell/Shell";

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}
