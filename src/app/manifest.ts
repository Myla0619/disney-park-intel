import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "迪士尼行程助手",
    short_name: "迪士尼行程",
    description: "上海迪士尼实时排队与行程规划",
    // 独立窗口：园区里当作 App 用，不显示浏览器地址栏
    display: "standalone",
    orientation: "portrait",
    start_url: "/dashboard",
    scope: "/",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    lang: "zh-CN",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
