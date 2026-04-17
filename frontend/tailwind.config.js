/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand accent — forest green
        brand: {
          400: "#6b9e5e",
          500: "#3a5c30",
          600: "#1c2419",
          700: "#141b10",
        },
        // Dark surfaces — the main palette
        dark: {
          bg:      "#09090b",   // page background
          surface: "#111113",   // card / panel
          raised:  "#18181b",   // elevated surface
          border:  "#27272a",   // default border
          divider: "#1f1f23",   // subtle divider
        },
        // Text
        ink: {
          primary:   "#fafafa",  // headings, values
          secondary: "#a1a1aa",  // labels, metadata
          muted:     "#52525b",  // placeholders, very muted
          dim:       "#3f3f46",  // disabled
        },
        // Status colors (muted for dark bg)
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
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        glow: "0 0 0 1px rgba(99,102,241,0.3)",
      },
    },
  },
  plugins: [],
};
