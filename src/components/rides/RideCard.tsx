"use client";

import { Ride, RideScore, Review } from "@/types";
import { Clock, Star, TrendingUp, ChevronRight, AlertCircle, Zap } from "lucide-react";
import Link from "next/link";

type Props = {
  ride: Ride;
  score?: RideScore;
  reviews?: Review[];
};

const PRIORITY_CONFIG = {
  "must-do": { label: "必玩", bg: "bg-emerald-500", text: "text-white" },
  "worth-it": { label: "值得玩", bg: "bg-blue-500", text: "text-white" },
  "if-time": { label: "有时间玩", bg: "bg-amber-500", text: "text-white" },
  "skip": { label: "可跳过", bg: "bg-slate-400", text: "text-white" },
};

const THRILL_LABELS = ["", "温和", "略刺激", "中等", "刺激", "极刺激"];

export function RideCard({ ride, score, reviews = [] }: Props) {
  const priority = score?.priority ?? "if-time";
  const config = PRIORITY_CONFIG[priority];
  const avgRating = reviews.length
    ? (reviews.reduce((a, b) => a + b.rating, 0) / reviews.length).toFixed(1)
    : null;
  const posReviews = reviews.filter((r) => r.sentiment === "positive").length;
  const sentimentPct = reviews.length ? Math.round((posReviews / reviews.length) * 100) : null;

  const waitColor =
    ride.waitTime == null ? "text-slate-400"
    : ride.waitTime <= 20 ? "text-emerald-400"
    : ride.waitTime <= 45 ? "text-amber-400"
    : "text-red-400";

  const allTags = [...new Set(reviews.flatMap((r) => r.tags))].slice(0, 3);

  return (
    <Link href={`/rides/${ride.id}`}>
      <div className="group bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all duration-200 cursor-pointer">
        <div className="flex items-start gap-3">
          {/* Score circle */}
          {score && (
            <div className="relative flex-shrink-0 w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={score.overallScore >= 70 ? "#10b981" : score.overallScore >= 50 ? "#f59e0b" : "#64748b"}
                  strokeWidth="3"
                  strokeDasharray={`${(score.overallScore / 100) * 94} 94`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {score.overallScore}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2">{ride.name}</h3>
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${config.bg} ${config.text}`}>
                {config.label}
              </span>
            </div>

            <div className="text-white/40 text-xs mt-0.5">{ride.area}</div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Wait time */}
              <div className={`flex items-center gap-1 text-xs font-medium ${waitColor}`}>
                <Clock className="w-3 h-3" />
                {ride.waitTime != null ? `${ride.waitTime}分钟` : "演出/关闭"}
              </div>

              {/* Thrill */}
              <div className="flex items-center gap-1 text-xs text-white/40">
                <Zap className="w-3 h-3" />
                {THRILL_LABELS[ride.thrillScore]}
              </div>

              {/* Rating */}
              {avgRating && (
                <div className="flex items-center gap-1 text-xs text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400" />
                  {avgRating}
                </div>
              )}

              {/* Sentiment */}
              {sentimentPct !== null && (
                <div className="flex items-center gap-1 text-xs text-white/40">
                  <TrendingUp className="w-3 h-3" />
                  {sentimentPct}% 好评
                </div>
              )}
            </div>

            {/* Height warning */}
            {ride.heightRequirement && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-white/30">
                <AlertCircle className="w-3 h-3" />
                最低身高 {ride.heightRequirement}cm
              </div>
            )}

            {/* AI reasoning */}
            {score?.reasoning && (
              <p className="text-white/50 text-xs mt-2 leading-relaxed line-clamp-2">{score.reasoning}</p>
            )}

            {/* Tags from reviews */}
            {allTags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {allTags.map((tag) => (
                  <span key={tag} className="text-xs bg-white/5 text-white/40 px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors flex-shrink-0 mt-1" />
        </div>
      </div>
    </Link>
  );
}
