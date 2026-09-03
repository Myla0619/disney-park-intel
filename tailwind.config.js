/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        /**
         * 「园区夜晚」配色。
         *
         * 原来是 slate + blue 的通用深色仪表盘，放在任何后台系统里都不违和，
         * 也就意味着毫无识别度。这套色以夜间园区为参照：
         *   night   深紫夜空，作为背景与卡片底色
         *   magic   魔法紫，主操作与选中态
         *   spark   烟花品红，强调与心愿标记
         *   castle  城堡暖金，评分与高光
         *   lagoon  幻境青，实时数据与信息提示
         * 饱和度整体上调，避免夜色显得发灰。
         */
        night: {
          950: "#0d0620",
          900: "#150b2e",
          850: "#1c1039",
          800: "#241548",
          700: "#2f1c5c",
          600: "#3d2775",
        },
        magic: {
          400: "#c084fc",
          500: "#a855f7",
          600: "#9333ea",
        },
        spark: {
          400: "#f472b6",
          500: "#ec4899",
          600: "#db2777",
        },
        castle: {
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
        },
        lagoon: {
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
        },
        meadow: {
          400: "#34d399",
          500: "#10b981",
        },
        ember: {
          400: "#fb7185",
          500: "#f43f5e",
        },
      },
      backgroundImage: {
        /** 夜空：上方偏紫、下方更深，模拟园区上空的光晕 */
        "night-sky":
          "radial-gradient(120% 80% at 50% -10%, #3d2775 0%, #1c1039 45%, #0d0620 100%)",
        "magic-gradient": "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
        "castle-gradient": "linear-gradient(135deg, #fbbf24 0%, #f472b6 100%)",
      },
      boxShadow: {
        /** 选中态的柔光，像灯带打在卡片上 */
        glow: "0 0 0 1px rgba(168,85,247,.35), 0 8px 28px -8px rgba(168,85,247,.55)",
        "glow-spark": "0 0 0 1px rgba(236,72,153,.35), 0 8px 28px -8px rgba(236,72,153,.5)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
