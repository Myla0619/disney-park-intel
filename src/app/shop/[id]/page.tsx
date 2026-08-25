"use client";
import { useParams, useRouter } from "next/navigation";
import { getShopSpots } from "@/lib/parks-data";
import { ArrowLeft, MapPin, Clock, Tag } from "lucide-react";
import WishlistButton from "@/components/WishlistButton";

export default function ShopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const shop = getShopSpots("shanghai").find((s) => s.id === id);
  if (!shop) return null;

  const bestTimeLabel = { opening:"开园即来，货最全", anytime:"全天适合", "before-closing":"离园前扫货" }[shop.bestTimeToVisit];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">{shop.name}</h1>
            <p className="text-white/40 text-xs">{shop.areaName}</p>
          </div>
          <WishlistButton id={shop.id} label={shop.name} size="sm" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {shop.hasLimitedEdition && <span className="text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full">⭐ 有限定款</span>}
          {shop.tags.map((t) => <span key={t} className="text-xs bg-white/10 text-white/50 px-2.5 py-1 rounded-full">{t}</span>)}
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-blue-400" /><span className="text-white/70">{shop.areaName}</span></div>
          <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-amber-400" /><span className="text-white/70">建议时机：{bestTimeLabel}</span></div>
          <div className="flex items-center gap-2 text-sm"><Tag className="w-4 h-4 text-emerald-400" /><span className="text-white/70">主题：{shop.theme}</span></div>
          <p className="text-white/50 text-xs">建议停留：{shop.duration} 分钟</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <h2 className="font-medium text-sm text-emerald-300 mb-2">购物小贴士</h2>
          <p className="text-white/70 text-sm leading-relaxed">{shop.tips}</p>
        </div>
      </div>
    </div>
  );
}
