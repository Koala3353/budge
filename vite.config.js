import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes all asset paths relative, so the built app works on
// GitHub Pages project sites (e.g. /budge/) without hardcoding the repo name.
// Do NOT change this — the live URL depends on it.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        // Keep React in its own long-cached chunk so app updates don't force a
        // re-download of the framework.
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
