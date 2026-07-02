import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Capture the install prompt as early as possible (it can fire before the
// InstallPrompt component mounts) so the in-app banner can offer one-tap
// install on Android/Chrome. iOS has no such event — it uses manual steps.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__budgeInstallEvent = e;
  window.dispatchEvent(new Event("budge:installable"));
});
window.addEventListener("appinstalled", () => {
  window.__budgeInstallEvent = null;
  window.dispatchEvent(new Event("budge:installed"));
});

// Register the service worker (relative path keeps it working under the
// /budge/ GitHub Pages base). The "Check for updates" button in Settings can
// clear its cache on demand.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline / unsupported — app still works without it */
    });
  });
}
