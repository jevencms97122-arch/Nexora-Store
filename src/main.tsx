import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initNative } from "./lib/native";
import { Launcher, type LaunchTarget } from "./pages/Launcher";
import { applyStoredTheme } from "./state/theme";

applyStoredTheme();

// Set by the native side when the app is started from a desktop shortcut.
const launchTarget = (window as unknown as { __NEXORA_LAUNCH__?: LaunchTarget }).__NEXORA_LAUNCH__;

initNative().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{launchTarget ? <Launcher target={launchTarget} /> : <App />}</React.StrictMode>,
  );
});
