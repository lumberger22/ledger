import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { watchSystemTheme } from "./utils/theme";

// The theme class itself is already applied by index.html's inline
// bootstrap script before this module even loads (avoids a light-mode
// flash) — this just keeps it live for as long as the tab stays open while
// the user's choice is "system".
watchSystemTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
