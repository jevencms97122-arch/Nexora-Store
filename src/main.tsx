import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initNative } from "./lib/native";
import { applyStoredTheme } from "./state/theme";

applyStoredTheme();

initNative().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
