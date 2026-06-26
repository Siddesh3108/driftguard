/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          900: "#0a0f1e",
          800: "#111827",
          700: "#1a2233",
          600: "#1e293b",
          500: "#243347",
        },
        brand: {
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
        },
        drift: {
          ok: "#22c55e",
          warn: "#f59e0b",
          alert: "#ef4444",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        pulse_slow: "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        fade_in: "fadeIn 0.3s ease-in",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
