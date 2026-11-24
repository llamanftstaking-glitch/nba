import type { Config } from "tailwindcss";

// Colours resolve to the CSS variables declared in app/globals.css (single source of truth,
// documented in docs/design/DESIGN-SYSTEM.md). Triplets allow Tailwind's `/opacity` modifiers.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        bg2: v("bg-2"),
        panel: v("card"),
        card: v("card"),
        raised: v("elevated"),
        line: v("border"),
        "line-strong": v("border"),
        ink: v("text"),
        soft: v("text-soft"),
        muted: v("text-2"),
        faint: v("text-3"),
        accent: v("accent"),
        "accent-dim": v("accent-dim"),
        teal: v("teal"),
        warn: v("warn"),
        "warn-dim": v("warn-dim"),
        bad: v("error"),
        "bad-dim": v("error-dim"),
        info: v("data"),
        "info-dim": v("data-dim"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Barlow Condensed", "Arial Narrow", "Inter", "ui-sans-serif", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "15px"],
        xs: ["12px", "17px"],
        sm: ["var(--fs-body)", "1.45"],
        base: ["var(--fs-body)", "1.5"],
        lg: ["16px", "23px"],
      },
      borderRadius: { DEFAULT: "6px", md: "8px", lg: "12px" },
      boxShadow: {
        // The only glow in the system: active navigation item and primary button.
        accent: "0 0 0 1px rgb(var(--accent) / 0.35), 0 0 18px -6px rgb(var(--accent) / 0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
