import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080b",
          900: "#0d0f14",
          800: "#14171f",
          700: "#1c2029",
          600: "#2a2f3b",
          400: "#8b93a7",
          200: "#d7dae2",
          50: "#f7f8fa",
        },
        accent: {
          DEFAULT: "#6d5bff",
          soft: "#a89bff",
          bright: "#8f7dff",
        },
        signal: {
          money: "#37d69b",
          time: "#5bb8ff",
          status: "#ffb454",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(109,91,255,0.25), 0 20px 60px -20px rgba(109,91,255,0.45)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, transparent, rgba(7,8,11,1)), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
