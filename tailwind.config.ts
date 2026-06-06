import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-[#FDF8F2]',
    'bg-[#D4EDE1]',
    'bg-[#FFF3CD]',
    'bg-[#FEF3E2]',
    'bg-[#E8F8EE]',
    'bg-[#EAE4F7]',
    'bg-[#FFE4E4]',
    'bg-[#E8406A]',
    'text-[#4A3F5C]',
    'text-[#8B7FA0]',
    'text-[#C03060]',
  ],
  theme: {
    extend: {
      colors: {
        bebebou: {
          50: "#fff5f7",
          100: "#ffe8ed",
          200: "#ffd1dc",
          300: "#ffb3c6",
          400: "#ff8fab",
          500: "#ff6b9d",
          600: "#e84d7f",
          700: "#c73666",
          800: "#a32d54",
          900: "#862a4a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
