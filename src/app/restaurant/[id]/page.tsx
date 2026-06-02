"use client";
import { useParams, useRouter } from "next/navigation";
import { getRestaurants } from "@/lib/parks-data";
import { ArrowLeft, Star, MapPin, Clock, AlertCircle } from "lucide-react";

export default function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const rest = getRestaurants("shanghai").find((r) => r.id === id);
  if (!rest) return null;

  const typeLabel = { quick:"快餐", normal:"正餐", fancy:"精致餐厅" }[rest.type];
  const sourceLabel: Record<string,string> = { xiaohongshu:"小红书", tripadvisor:"TripAdvisor", weibo:"微博" };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">{rest.name}</h1>
            <p className="text-white/40 text-xs">{rest.areaName}</p>
          </div>
          <span className="text-amber-400 font-bold">⭐{rest.rating}</span>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full">{typeLabel}</span>
          <span className="text-xs bg-white/10 text-white/50 px-2.5 py-1 rounded-full">{rest.cuisine}</span>
          <span className="text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full">{rest.priceRange}</span>
          {rest.requiresReservation && <span className="text-xs bg-red-500/20 text-red-300 px-2.5 py-1 rounded-full">需预约</span>}
          {rest.photoWorthy && <span className="text-xs bg-pink-500/20 text-pink-300 px-2.5 py-1 rounded-full">📸 适合拍照</span>}
        </div>

        {rest.requiresReservation && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium text-sm">需要提前预约</p>
              <p className="text-white/60 text-xs mt-1 leading-relaxed">{rest.reservationTips}</p>
            </div>
          </div>
        )}

        <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-blue-400" /><span className="text-white/70">{rest.areaName}</span></div>
          <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-amber-400" /><span className="text-white/70">用餐时长约 {rest.duration} 分钟</span></div>
          <p className="text-white/60 text-sm leading-relaxed mt-2">{rest.tips}</p>
        </div>

        <div>
          <h2 className="font-semibold text-sm text-white/70 mb-3">用户评论（{rest.reviews.length}条）</h2>
          <div className="space-y-3">
            {rest.reviews.map((rev, i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full">{sourceLabel[rev.source] ?? rev.source}</span>
                    <span className="text-white/60 text-sm">{rev.author}</span>
                  </div>
                  <div className="flex">
                    {[...Array(5)].map((_,j) => <Star key={j} className={`w-3 h-3 ${j<rev.rating?"fill-amber-400 text-amber-400":"text-white/10"}`} />)}
                  </div>
                </div>
                <p className="text-white/70 text-sm leading-relaxed">{rev.text}</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {rev.tags.map((t) => <span key={t} className="text-xs bg-white/5 text-white/30 px-1.5 py-0.5 rounded">#{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
