import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#05080f",
        panel: "#0a1020",
        raised: "#0f172b",
        line: "#1d2942",
        "line-strong": "#2b3a5c",
        ink: "#ffffff",
        soft: "#cbd5e1",
        muted: "#94a3b8",
        accent: "#34d399",
        "accent-dim": "#0b3b2e",
        warn: "#fbbf24",
        "warn-dim": "#3d2e06",
        bad: "#f87171",
        "bad-dim": "#3f1418",
        info: "#7dd3fc",
        "info-dim": "#0c2f45",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "JetBrains Mono", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "15px"],
        xs: ["12px", "17px"],
        sm: ["13px", "19px"],
        base: ["14px", "21px"],
      },
      borderRadius: { DEFAULT: "3px", md: "4px", lg: "6px" },
    },
  },
  plugins: [],
};

export default config;
