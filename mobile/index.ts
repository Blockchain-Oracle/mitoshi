// The entry (D-227, MOBILE). The native splash is held from the first line until the page has painted
// (src/shell/Shell.tsx lifts it), and it fades rather than cuts on iOS.
import * as SplashScreen from "expo-splash-screen";
import { registerRootComponent } from "expo";
import App from "./src/App";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 250 });

registerRootComponent(App);
