import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// After build, inject the real asset list + a version hash into dist/sw.js so
// the service worker can PRECACHE the whole shell (index.html + every hashed
// JS/CSS chunk + manifest/icons). Without this the SW only caches lazily and
// code-split screens the user hadn't opened wouldn't load offline. Paths are
// relative to the SW's location, so they resolve correctly under /budge/.
function precacheSW() {
  return {
    name: "precache-sw",
    apply: "build",
    closeBundle() {
      const dist = join(process.cwd(), "dist");
      const files = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(dist, p).split(sep).join("/"));
        }
      };
      walk(dist);
      const precache = files.filter((f) =>
        /\.(html|js|css|webmanifest|json|png|ico|svg)$/.test(f)
      );

      // Strip Vite's `crossorigin` from the entry <script>/<link> tags. It's
      // unnecessary for a same-origin app, and it makes the browser's preload
      // path bypass the service worker for those requests — so offline they hit
      // the (dead) network and the app renders blank. Removing it lets the SW
      // serve them from the precache. (See the offline blank-screen bug.)
      const htmlPath = join(dist, "index.html");
      const html = readFileSync(htmlPath, "utf8").replace(/\s+crossorigin(?==|>|\s|\/)/g, "");
      writeFileSync(htmlPath, html);

      // Read the template (kept out of public/ so nothing overwrites our output).
      const template = readFileSync(join(process.cwd(), "sw.template.js"), "utf8");

      // Version = hash of the asset list + index.html + the SW logic, so the SW
      // bytes change whenever anything shippable changes → old caches get purged
      // and the new worker installs.
      let h = 5381;
      const key = precache.slice().sort().join("|") + "|" + html + "|" + template;
      for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
      const version = h.toString(36);

      // Target the assignment expressions specifically (the tokens also appear
      // in the template's comment, and String.replace only hits the first match).
      const sw = template
        .replace("= __PRECACHE__;", "= " + JSON.stringify(precache) + ";")
        .replace('= "__VERSION__";', '= "' + version + '";');
      writeFileSync(join(dist, "sw.js"), sw);
      console.log(`precache-sw: ${precache.length} files, version ${version}`);
    },
  };
}

// base: "./" makes all asset paths relative, so the built app works on
// GitHub Pages project sites (e.g. /budge/) without hardcoding the repo name.
// Do NOT change this — the live URL depends on it.
export default defineConfig({
  plugins: [react(), precacheSW()],
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
