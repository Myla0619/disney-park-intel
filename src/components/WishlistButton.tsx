"use client";

import { Heart } from "lucide-react";
import { useWishlistStore } from "@/lib/wishlist-store";

type Props = {
  id: string;
  /** 用于无障碍标签，例如「创极速光轮」 */
  label: string;
  size?: "sm" | "md";
  className?: string;
};

/**
 * 「想去」开关。
 *
 * 勾选后该条目在下次规划时会被大幅提权，几乎必然排入行程。
 * 按钮上直接写明这一点——否则用户不知道勾了到底有什么用。
 */
export default function WishlistButton({ id, label, size = "md", className = "" }: Props) {
  const ids = useWishlistStore((s) => s.ids);
  const toggle = useWishlistStore((s) => s.toggle);
  const active = ids.includes(id);

  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `取消想去：${label}` : `标记想去：${label}`}
      onClick={(e) => {
        // 详情卡片整体可点击，勾选不应连带触发跳转
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors ${pad} ${
        active
          ? "border-transparent bg-magic-gradient text-white shadow-glow-spark"
          : "border-white/12 bg-white/5 text-white/60 hover:border-spark-400/40 hover:text-spark-300"
      } ${className}`}
    >
      <Heart className={`${icon} ${active ? "fill-current" : ""}`} />
      {active ? "已加入行程" : "想去"}
    </button>
  );
}
