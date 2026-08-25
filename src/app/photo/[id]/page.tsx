"use client";
import { useParams, useRouter } from "next/navigation";
import { getPhotoSpots } from "@/lib/parks-data";
import WishlistButton from "@/components/WishlistButton";
import { ArrowLeft, Clock, MapPin, Camera, ExternalLink } from "lucide-react";

export default function PhotoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const spot = getPhotoSpots("shanghai").find((s) => s.id === id);
  if (!spot) return null;

  const typeLabel = { landmark:"地标", themed:"主题", interactive:"互动", scenic:"景观" }[spot.photoType];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">{spot.name}</h1>
            <p className="text-white/40 text-xs">{spot.areaName}</p>
          </div>
          <WishlistButton id={spot.id} label={spot.name} size="sm" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* 来源：游客笔记的机位标明出处，可回原帖核对 */}
        {"source" in spot && (spot as any).source?.url && (
          <a
            href={(spot as any).source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100/90 transition-colors hover:bg-amber-500/15"
          >
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>
              该机位来自游客笔记，非官方信息。
              {(spot as any).source.quote && (
                <span className="mt-1 block text-amber-100/60">
                  「{String((spot as any).source.quote).slice(0, 60)}」
                </span>
              )}
              <span className="mt-1 block text-amber-300 underline">查看原帖 →</span>
            </span>
          </a>
        )}

        {/* 类型标签 */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs bg-pink-500/20 text-pink-300 px-2.5 py-1 rounded-full">{typeLabel}</span>
          {spot.tags.map((t) => <span key={t} className="text-xs bg-white/10 text-white/50 px-2.5 py-1 rounded-full">{t}</span>)}
        </div>

        {/* 最佳时段 */}
        <div className="bg-slate-800/50 rounded-xl p-4">
          <h2 className="font-medium text-sm text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> 最佳拍摄时段
          </h2>
          <div className="space-y-2">
            {spot.bestTimeSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="text-sm text-white/70">{slot}</span>
              </div>
            ))}
          </div>
          <p className="text-white/50 text-xs mt-3 leading-relaxed">💡 {spot.bestConditions}</p>
        </div>

        {/* 位置信息 */}
        <div className="bg-slate-800/50 rounded-xl p-4">
          <h2 className="font-medium text-sm text-white mb-2 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400" /> 位置信息
          </h2>
          <p className="text-white/70 text-sm">所在区域：{spot.areaName}</p>
          {spot.nearestRide && (
            <p className="text-white/50 text-sm mt-1">离最近项目步行约 <span className="text-white font-medium">{spot.walkFromNearestRide} 分钟</span></p>
          )}
          <p className="text-white/50 text-xs mt-1">建议停留时间：{spot.duration} 分钟</p>
        </div>

        {/* 拍摄技巧 */}
        <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-4">
          <h2 className="font-medium text-sm text-pink-300 mb-2 flex items-center gap-2">
            <Camera className="w-4 h-4" /> 拍摄技巧
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">{spot.tips}</p>
        </div>

        {/* 小红书链接 */}
        <a href={`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(spot.xhsKeyword)}`}
           target="_blank" rel="noopener noreferrer"
           className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/15 transition-all">
          <div>
            <div className="text-red-300 font-medium text-sm">小红书更多机位参考</div>
            <div className="text-white/40 text-xs mt-0.5">搜索「{spot.xhsKeyword}」</div>
          </div>
          <ExternalLink className="w-4 h-4 text-red-400" />
        </a>
      </div>
    </div>
  );
}
