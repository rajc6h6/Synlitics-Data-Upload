/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#020617",
          800: "#0f172a",
        },
        orange: {
          500: "#f97316",
        },
        cyan: {
          400: "#22d3ee",
        },
      },
      boxShadow: {
        glass: "0 24px 80px rgba(0,0,0,0.65)",
      },
      backgroundImage: {
        "noise": "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.18'/%3E%3C/svg%3E\")",
        "radial-glow":
          "radial-gradient(circle at 10% 0%, rgba(249,115,22,0.28), transparent 55%), radial-gradient(circle at 90% 100%, rgba(34,211,238,0.20), transparent 60%)",
      },
    },
  },
  plugins: [],
};