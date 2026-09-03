"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getRideById } from "@/lib/parks-data";
import { useProfileStore } from "@/lib/store";
import WishlistButton from "@/components/WishlistButton";
import { Review, Ride } from "@/types";
import {
  ArrowLeft, Star, Clock, Zap, AlertCircle, Heart,
  ThumbsUp, ThumbsDown, Minus, ExternalLink, TrendingUp
} from "lucide-react";

const SOURCE_LABEL: Record<string, string> = {
  xiaohongshu: "小红书",
  tripadvisor: "TripAdvisor",
  google: "Google",
  weibo: "微博",
};

const SOURCE_COLOR: Record<string, string> = {
  xiaohongshu: "bg-ember-500/20 text-ember-400",
  tripadvisor: "bg-meadow-500/20 text-meadow-400",
  google: "bg-magic-500/20 text-magic-300",
};

const THRILL_LABELS = ["", "温和", "略刺激", "中等", "刺激", "极刺激"];
const TYPE_EMOJI: Record<string, string> = {
  coaster: "🎢", dark: "👻", boat: "⛵", simulator: "🎮",
  spinner: "🎡", show: "🎭", drop: "🪂",
};

export default function RideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);

  const [ride, setRide] = useState<Ride | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<{ positive: number; neutral: number; negative: number; avgRating: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = getRideById(id as string);
    if (!r) { router.push("/dashboard"); return; }
    setRide(r);
    fetch(`/api/reviews?rideId=${id}`)
      .then((res) => res.json())
      .then((data) => {
        setReviews(data.reviews ?? []);
        setSummary(data.summary ?? null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (!ride) return null;

  const kidsCanRide = !ride.heightRequirement || (profile?.kids??[]).length === 0 ||
    (profile?.kids ?? []).some((k) => k.heightCm >= (ride.heightRequirement ?? 0));

  const waitColor = ride.waitTime == null ? "text-white/45"
    : ride.waitTime <= 20 ? "text-meadow-400"
    : ride.waitTime <= 45 ? "text-castle-400"
    : "text-ember-400";

  const allTags = [...new Set(reviews.flatMap((r) => r.tags))];

  return (
    <div className="min-h-screen bg-night-900 text-white pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-night-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm truncate">{ride.name}</h1>
            <p className="text-white/40 text-xs">{ride.area}</p>
          </div>
          <WishlistButton id={ride.id} label={ride.name} size="sm" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Hero stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-night-800/55 rounded-xl p-3 text-center">
            <Clock className={`w-5 h-5 mx-auto mb-1 ${waitColor}`} />
            <div className={`font-bold text-xl ${waitColor}`}>{ride.waitTime != null ? ride.waitTime : "—"}</div>
            <div className="text-white/40 text-xs">{ride.waitTime != null ? "分钟等待" : "演出/关闭"}</div>
          </div>
          <div className="bg-night-800/55 rounded-xl p-3 text-center">
            <Zap className="w-5 h-5 mx-auto mb-1 text-castle-400" />
            <div className="font-bold text-xl">{ride.thrillScore}/5</div>
            <div className="text-white/40 text-xs">{THRILL_LABELS[ride.thrillScore]}</div>
          </div>
          <div className="bg-night-800/55 rounded-xl p-3 text-center">
            <Heart className="w-5 h-5 mx-auto mb-1 text-spark-400" />
            <div className="font-bold text-xl">{ride.kidsScore}/5</div>
            <div className="text-white/40 text-xs">亲子友好度</div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-night-800/55 rounded-xl p-4">
          <p className="text-white/70 text-sm leading-relaxed">{ride.description}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {ride.heightRequirement ? (
              <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                (profile?.kids??[]).length && !kidsCanRide
                  ? "bg-ember-500/20 text-ember-400" : "bg-white/10 text-white/50"
              }`}>
                <AlertCircle className="w-3 h-3" />
                身高 {ride.heightRequirement}cm+
                {(profile?.kids??[]).length && !kidsCanRide ? " · ⚠️ 孩子可能不够高" : ""}
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-meadow-500/20 text-meadow-400">无身高限制</span>
            )}
            {ride.llEligible && (
              <span className="text-xs px-2 py-1 rounded-full bg-magic-500/20 text-magic-300">⚡ 支持闪电通道</span>
            )}
            {ride.tags.map((tag) => (
              <span key={tag} className="text-xs px-2 py-1 rounded-full bg-white/5 text-white/40">{tag}</span>
            ))}
          </div>
        </div>

        {/* Sentiment summary */}
        {summary && (
          <div className="bg-night-800/55 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-magic-400" />
              <span className="font-medium text-sm">用户评价分析</span>
              <span className="ml-auto flex items-center gap-1 text-castle-400 text-sm font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400" /> {summary.avgRating}
              </span>
            </div>
            <div className="flex gap-2 mb-2">
              {[
                { label: "好评", count: summary.positive, icon: ThumbsUp, color: "text-meadow-400", bg: "bg-meadow-500" },
                { label: "中性", count: summary.neutral, icon: Minus, color: "text-white/40", bg: "bg-white/20" },
                { label: "差评", count: summary.negative, icon: ThumbsDown, color: "text-ember-400", bg: "bg-ember-500" },
              ].map((s) => (
                <div key={s.label} className="flex-1 text-center">
                  <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                  <div className={`font-bold ${s.color}`}>{s.count}</div>
                  <div className="text-white/30 text-xs">{s.label}</div>
                </div>
              ))}
            </div>
            {/* Sentiment bar */}
            <div className="h-2 rounded-full bg-night-700 overflow-hidden flex">
              {summary.positive > 0 && (
                <div className="bg-meadow-500 h-full" style={{ width: `${(summary.positive / (summary.positive + summary.neutral + summary.negative)) * 100}%` }} />
              )}
              {summary.neutral > 0 && (
                <div className="bg-white/20 h-full" style={{ width: `${(summary.neutral / (summary.positive + summary.neutral + summary.negative)) * 100}%` }} />
              )}
              {summary.negative > 0 && (
                <div className="bg-ember-500 h-full" style={{ width: `${(summary.negative / (summary.positive + summary.neutral + summary.negative)) * 100}%` }} />
              )}
            </div>

            {/* Common tags */}
            {allTags.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {allTags.map((tag) => (
                  <span key={tag} className="text-xs bg-white/5 text-white/40 px-2 py-1 rounded-full">#{tag}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reviews */}
        <div>
          <h2 className="font-semibold text-sm mb-3 text-white/70">真实用户评论 ({reviews.length})</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-night-800/55 rounded-xl animate-pulse" />)}
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">暂无评论数据</div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review, i) => (
                <div key={i} className="bg-night-800/55 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SOURCE_COLOR[review.source] ?? "bg-white/10 text-white/50"}`}>
                        {SOURCE_LABEL[review.source]}
                      </span>
                      <span className="text-white/60 text-sm font-medium">{review.author}</span>
                    </div>
                    <div className="flex items-center gap-1 text-castle-400 flex-shrink-0">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className={`w-3 h-3 ${j < review.rating ? "fill-amber-400" : "text-white/10"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed">{review.text}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1 flex-wrap">
                      {review.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs bg-white/5 text-white/30 px-1.5 py-0.5 rounded">#{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        review.sentiment === "positive" ? "bg-meadow-500/20 text-meadow-400"
                        : review.sentiment === "negative" ? "bg-ember-500/20 text-ember-400"
                        : "bg-white/10 text-white/30"
                      }`}>
                        {review.sentiment === "positive" ? "👍" : review.sentiment === "negative" ? "👎" : "😐"}
                      </span>
                      <span className="text-white/20 text-xs">{new Date(review.date).toLocaleDateString("zh-CN")}</span>
                    </div>
                  </div>
                  {review.url && (
                    <a href={review.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-magic-400/60 text-xs mt-2 hover:text-magic-400">
                      查看原文 <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
