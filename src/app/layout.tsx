import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import OfflineBanner from "@/components/OfflineBanner";

export const metadata: Metadata = {
  title: "迪士尼乐园智能助手",
  description: "上海迪士尼实时排队与行程规划",
  // iOS 不完全支持 manifest，独立窗口与状态栏样式要靠这组 meta
  appleWebApp: {
    capable: true,
    title: "迪士尼行程",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  // 园区里单手操作，禁止双击缩放导致的误触；但保留系统级辅助缩放
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <ServiceWorkerRegistrar />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
