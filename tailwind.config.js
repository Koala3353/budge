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
        // Accent as a CSS variable so it can be tuned per mode (index.css) and
        // still take opacity modifiers like bg-matcha/10.
        matcha: {
          DEFAULT: "rgb(var(--matcha) / <alpha-value>)",
          dark: "rgb(var(--matcha-press) / <alpha-value>)",
          light: "#7BA87A",
        },
        over: "#E5484D", // tomato / over-budget red
        caution: "#F5A623", // amber / nearing limit
        // budge· neutral ramp: sage-tinted, but desaturated from the original so
        // dark surfaces read as graphite with a hint of green rather than olive.
        gray: {
          50: "#F2F4F1", // light page bg / dark primary text
          100: "#E9EDE8", // light track, segmented bg
          200: "#DFE4DD", // light border / disabled fill
          300: "#C6CEC4", // light stronger border
          400: "#8C9890", // tertiary text (both modes)
          500: "#5C6A61", // light secondary text
          600: "#47554C", // light body text
          700: "#2C3731", // dark input border
          800: "#1F2823", // dark raised surface / border
          900: "#141B17", // light primary text / dark card
          950: "#0A0E0C", // dark page bg
        },
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
