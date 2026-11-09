import type { Config } from "tailwindcss";

// Asana-inspired: neutral greys, one accent (TBM purple), quiet borders.
// Every neutral is a CSS variable (see globals.css) so light/dark mode is a
// single class switch on <html> rather than dark: variants everywhere.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        editorial: ["var(--font-editorial)", "Newsreader", "Georgia", "serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        apollo: {
          yellow: "#FFE600",
          yellowHover: "#F2DC00",
          canvas: "#FAF9F5",
          dark: "#18181B",
        },
        surface: v("surface"),
        canvas: v("canvas"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        accent: {
          DEFAULT: "#5b3fd1",
          soft: v("accent-soft"),
          dark: "#4a32b0",
        },
        side: {
          DEFAULT: v("side"),
          hover: v("side-hover"),
          active: v("side-active"),
          fg: v("side-fg"),
          muted: v("side-muted"),
        },
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        panel: "-8px 0 24px -12px rgba(0,0,0,0.25)",
        pop: "0 8px 24px -8px rgba(0,0,0,0.30)",
      },
    },
  },
  plugins: [],
};
export default config;
