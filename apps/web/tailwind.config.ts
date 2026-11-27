import type { Config } from "tailwindcss";

// Colours resolve to the CSS variables declared in app/globals.css (single source of truth,
// documented in docs/design/DESIGN-SYSTEM.md). Triplets allow Tailwind's `/opacity` modifiers.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const FAMILY = ["Archivo Variable", "Helvetica Neue", "Arial", "sans-serif"];

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), // paper
        bg2: v("bg-2"), // sheet
        paper: v("bg"),
        sheet: v("bg-2"),
        band: v("elevated"),
        panel: v("card"),
        card: v("card"),
        raised: v("elevated"),
        line: v("border"),
        "line-strong": v("border-strong"),
        "rule-2": v("rule-2"),
        ink: v("text"),
        soft: v("text-soft"),
        muted: v("text-2"),
        faint: v("text-3"),
        accent: v("accent"),
        "accent-dim": v("accent-dim"),
        model: v("model"),
        "model-text": v("model-text"),
        teal: v("teal"),
        warn: v("warn"),
        "warn-dim": v("warn-dim"),
        bad: v("error"),
        "bad-dim": v("error-dim"),
        info: v("data"),
        "info-dim": v("data-dim"),
      },
      fontFamily: {
        // One family across its width axis: normal width for text, condensed and heavy for display.
        sans: FAMILY,
        display: FAMILY,
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      // rem so the browser's font-size setting is respected. Nothing below 13px.
      fontSize: {
        "2xs": ["0.8125rem", "1.125rem"], // 13
        xs: ["0.875rem", "1.25rem"], // 14 secondary
        sm: ["0.9375rem", "1.4rem"], // 15 dense tables and controls
        base: ["1rem", "1.5rem"], // 16 body
        lg: ["1.125rem", "1.45rem"], // 18 sub
      },
      borderRadius: { none: "0", sm: "2px", DEFAULT: "4px", md: "4px", lg: "4px", xl: "4px", "2xl": "4px" },
      boxShadow: {
        // Shadows exist only on overlays (dialog, sheet).
        overlay: "0 24px 64px rgb(18 22 26 / 0.28)",
        sheet: "-24px 0 64px rgb(18 22 26 / 0.16)",
      },
      maxWidth: { page: "1320px" },
    },
  },
  plugins: [],
};

export default config;
