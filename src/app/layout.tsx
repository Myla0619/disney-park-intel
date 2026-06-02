import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "迪士尼乐园智能助手",
  description: "AI 驱动的迪士尼乐园规划助手",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
