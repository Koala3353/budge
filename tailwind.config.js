/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{js,jsx}"],
  // `dark` class on <html>, set before first paint by the script in index.html
  // (and by theme.js afterwards). "System" still follows the device; the class
  // strategy is what lets Settings → Appearance override it.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Every themed colour is a CSS variable (palettes.css), written as
        // channels so opacity modifiers like bg-accent/10 keep working.
        // accent = the interactive tint (fills); accent-ink = accent used as
        // text on surfaces; on-accent = text/icons sitting on an accent fill.
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          press: "rgb(var(--accent-press) / <alpha-value>)",
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
        },
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        over: "#E5484D", // tomato / over-budget red
        caution: "#F5A623", // amber / nearing limit
        // Neutral ramp, per theme. Same slot meanings in every theme:
        // 50 light page / dark primary text · 100 tracks · 200-300 borders ·
        // 400 tertiary text · 500-600 secondary/body text · 700-800 dark borders
        // and raised surfaces · 900 dark card / light primary text · 950 dark page
        gray: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => [k, `rgb(var(--g-${k}) / <alpha-value>)`])
        ),
      },
      fontFamily: {
        // System first: SF on Apple devices ships optical sizing and tracking
        // tables; Inter where installed; then each platform's own UI face.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          "Inter",
          "system-ui",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
        sm: "var(--shadow-card)",
        lg: "var(--shadow-float)",
        "2xl": "var(--shadow-float)",
      },
      // Headings: -0.3 to -0.5px at their sizes (20-24px); body stays at 0.
      letterSpacing: { tight: "-0.02em", tighter: "-0.03em" },
      transitionDuration: { DEFAULT: "250ms" },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.23, 1, 0.32, 1)", // strong ease-out
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};
