// Appearance: "system" | "light" | "dark". A per-device preference, so it lives
// in localStorage rather than the synced account blob — your phone can be dark
// while your laptop is light. index.html applies it before first paint; this
// module handles changes afterwards.
const KEY = "budge.theme";
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
    apply.t = setTimeout(() => root.classList.remove("theme-anim"), 320);
  }
  root.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0A0E0C" : "#F2F4F1");
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
