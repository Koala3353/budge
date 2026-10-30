// Appearance: "system" | "light" | "dark". A per-device preference, so it lives
// in localStorage rather than the synced account blob — your phone can be dark
// while your laptop is light. index.html applies it before first paint; this
// module handles changes afterwards.
const KEY = "budge.theme";
const PALETTE_KEY = "budge.palette";
export const DEFAULT_PALETTE = "graphite";
export const PALETTES = ["graphite", "matcha", "pandan", "dagat", "tinta", "ube"];
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(theme, animate) {
  const dark = theme === "dark" || (theme === "system" && media?.matches);
  const root = document.documentElement;
  if (animate) {
    // Ease the switch: colours transition for one beat, then the class comes
    // off so ordinary interactions keep their own timing.
    root.classList.add("theme-anim");
    clearTimeout(apply.t);
    apply.t = setTimeout(() => {
      root.classList.remove("theme-anim");
      syncThemeColor(); // read the page colour once the transition has landed
    }, 320);
  }
  root.classList.toggle("dark", dark);
  if (!animate) syncThemeColor();
}

/** Browser chrome / status bar takes the page's resolved colour. */
export function syncThemeColor() {
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

// --- colour theme (palette) ---------------------------------------------------
export function getPalette() {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    return PALETTES.includes(v) ? v : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function setPalette(p) {
  const root = document.documentElement;
  try {
    if (p === DEFAULT_PALETTE) localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, p);
  } catch {
    /* private mode: still applies for this session */
  }
  root.classList.add("theme-anim");
  clearTimeout(apply.t);
  apply.t = setTimeout(() => {
    root.classList.remove("theme-anim");
    syncThemeColor(); // read the page colour once the transition has landed
  }, 320);
  if (p === DEFAULT_PALETTE) root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", p);
}

export function setTheme(theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: still applies for this session */
  }
  apply(theme, true);
}

// Follow the device while on "system".
media?.addEventListener?.("change", () => {
  if (getTheme() === "system") apply("system", true);
});
