/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand accent — mapped to CSS vars so they can be overridden per-theme
        brand: {
          400: "#6b9e5e",
          500: "#3a5c30",
          600: "#1c2419",
          700: "#141b10",
        },
        // Surfaces — all mapped to CSS variables (auto light/dark switch)
        dark: {
          bg:      "var(--c-bg)",
          surface: "var(--c-surface)",
          raised:  "var(--c-raised)",
          border:  "var(--c-border)",
          divider: "var(--c-divider)",
        },
        // Text — mapped to CSS variables
        ink: {
          primary:   "var(--c-ink-primary)",
          secondary: "var(--c-ink-secondary)",
          muted:     "var(--c-ink-muted)",
          dim:       "var(--c-ink-dim)",
        },
        // Status colors
        status: {
          green:  "#22c55e",
          red:    "#ef4444",
          amber:  "#f59e0b",
          blue:   "#3b82f6",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card:  "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        "card-dark": "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        glow:  "0 0 0 1px rgba(99,102,241,0.3)",
      },
    },
  },
  plugins: [],
};
