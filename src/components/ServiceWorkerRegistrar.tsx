"use client";

import { useEffect } from "react";

/**
 * 注册 Service Worker。
 *
 * 只在生产环境注册：开发时 SW 缓存会让改动看不到效果，反而干扰调试。
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[sw] 注册失败:", err);
      });
    };

    // 等页面加载完再注册，避免和首屏资源抢带宽
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
