"use client";

import { Star } from "lucide-react";
import { ratingKey, useUserRatingStore } from "@/lib/user-rating-store";

type Props = { type: "ride" | "restaurant"; id: string; name: string };

export default function UserRating({ type, id, name }: Props) {
  const value = useUserRatingStore((state) => state.ratings[ratingKey(type, id)] ?? 0);
  const setRating = useUserRatingStore((state) => state.setRating);

  return (
    <section className="rounded-xl border border-castle-400/15 bg-night-800/55 p-4" aria-label={`给${name}评分`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{value ? "你的评分" : "玩过/吃过？来打分"}</p>
          <p className="mt-0.5 text-xs text-white/35">{value ? `已记录 ${value} 分，可随时修改` : "点击星星，记录你的真实体验"}</p>
        </div>
        <div className="flex" role="group" aria-label="选择一到五星">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(type, id, star)}
              className="flex h-11 w-9 touch-manipulation items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-castle-300"
              aria-label={`${star}星`}
              aria-pressed={value === star}
            >
              <Star className={`h-5 w-5 ${star <= value ? "fill-amber-400 text-castle-400" : "text-white/20"}`} />
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-white/25">当前保存在此设备；登录与公开汇总将在接入用户系统后开放。</p>
    </section>
  );
}
