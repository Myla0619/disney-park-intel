"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProfileStore } from "@/lib/store";
import { getRidesByPark, getParkById } from "@/lib/parks-data";
import { resequenceItinerary } from "@/lib/routing";
import { RideCard } from "@/components/rides/RideCard";
import AgentChat from "@/components/AgentChat";
import { Ride, RideScore, Review, LiveWaitData, HistoricalWaitData, ItineraryItem } from "@/types";
import { RefreshCw, MapPin, Clock, Users, Zap, Coffee, Settings, Sparkles,
         Camera, ShoppingBag, CalendarCheck, Navigation, X, Bot,
         ChevronRight, Trash2, RefreshCcw, ArrowUp, ArrowDown } from "lucide-react";

const MODE_ICON: Record<string,any> = { family:Users, thrill:Zap, casual:Coffee, photo:Camera, shopping:ShoppingBag };
const MODE_LABEL: Record<string,string> = { family:"带娃家庭", thrill:"只玩刺激", casual:"轻松游览", photo:"拍照打卡", shopping:"购物美食" };
const ROUTE_LABEL: Record<string,string> = { efficient:"⚡效率", balanced:"⚖️均衡", easy:"🦶省力" };
const FILTER_OPTIONS = ["全部","必玩","值得玩","有时间玩","可跳过"] as const;
type Filter = typeof FILTER_OPTIONS[number];
const FILTER_MAP: Record<Filter, RideScore["priority"]|null> = {
  "全部":null,"必玩":"must-do","值得玩":"worth-it","有时间玩":"if-time","可跳过":"skip"
};

const ITEM_CONFIG: Record<string,{dot:string; icon:string; bg:string}> = {
  ride:      { dot:"border-blue-400 bg-blue-400/20",     icon:"🎢", bg:"bg-slate-800/40 hover:bg-slate-800/60" },
  walk:      { dot:"border-white/20 bg-white/5",         icon:"🚶", bg:"bg-transparent" },
  meal:      { dot:"border-amber-400 bg-amber-400/20",   icon:"🍽️", bg:"bg-amber-500/10 border border-amber-500/20" },
  photo:     { dot:"border-pink-400 bg-pink-400/20",     icon:"📸", bg:"bg-pink-500/10 border border-pink-500/20" },
  shop:      { dot:"border-emerald-400 bg-emerald-400/20",icon:"🛍️",bg:"bg-emerald-500/10 border border-emerald-500/20" },
  show:      { dot:"border-purple-400 bg-purple-400/20", icon:"🎭", bg:"bg-purple-500/10 border border-purple-500/20" },
  parade:    { dot:"border-yellow-400 bg-yellow-400/20", icon:"🎠", bg:"bg-yellow-500/10 border border-yellow-500/30" },
  fireworks: { dot:"border-yellow-400 bg-yellow-400/20", icon:"🎆", bg:"bg-orange-500/10 border border-yellow-500/30" },
  rest:      { dot:"border-white/20 bg-white/10",        icon:"☕", bg:"bg-slate-700/30" },
};

type Tab = "itinerary" | "rides" | "agent";

export default function DashboardPage() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);

  const [rides,           setRides]           = useState<Ride[]>([]);
  const [liveWaits,       setLiveWaits]       = useState<LiveWaitData[]>([]);
  const [historicalWaits, setHistoricalWaits] = useState<HistoricalWaitData[]>([]);
  const [scores,          setScores]          = useState<RideScore[]>([]);
  const [allReviews,      setAllReviews]      = useState<Record<string,Review[]>>({});
  const [itinerary,       setItinerary]       = useState<ItineraryItem[]>([]);
  const [parkHours,       setParkHours]       = useState<{open:string;close:string}|null>(null);
  const [filter,  setFilter]  = useState<Filter>("全部");
  const [tab,     setTab]     = useState<Tab>("itinerary");
  const [loading, setLoading] = useState(true);
  const [isToday, setIsToday] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date|null>(null);
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [replanning,     setReplanning]     = useState(false);

  // 长按状态
  const [longPressItem,  setLongPressItem]  = useState<ItineraryItem | null>(null);
  const [longPressIndex, setLongPressIndex] = useState<number>(-1);
  const [showSwapSheet,  setShowSwapSheet]  = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    if (!profile) { router.push("/onboarding"); return; }
    const today = new Date().toISOString().slice(0,10);
    setIsToday(profile.visitDate === today);
    loadAllData("entrance");
  }, [profile]);

  async function loadAllData(area: string) {
    if (!profile) return;
    setLoading(true);
    const rideList = getRidesByPark(profile.park);
    setRides(rideList);
    try {
      const today = new Date().toISOString().slice(0,10);
      const todayMode = profile.visitDate === today;

      const [wtRes, histRes] = await Promise.all([
        fetch(`/api/waittimes?park=${profile.park}`),
        fetch(`/api/waittimes?park=${profile.park}&mode=historical&date=${profile.visitDate}`),
      ]);
      const live: LiveWaitData[]       = (await wtRes.json()).data ?? [];
      const hist: HistoricalWaitData[] = (await histRes.json()).data ?? [];
      setLiveWaits(live);
      setHistoricalWaits(hist);

      const enriched = rideList.map((r) => {
        const h = hist.find((w) => w.rideId===r.id);
        const l = live.find((w) => w.rideId===r.id);
        return { ...r, waitTime:(todayMode?l?.waitMinutes:null)??h?.predictedWait??r.waitTime };
      });
      setRides(enriched);

      const reviewResults = await Promise.all(
        rideList.map(async (r) => {
          try {
            const res = await fetch(`/api/reviews?rideId=${r.id}`);
            const data = await res.json();
            return { id:r.id, reviews:data.reviews??[] };
          } catch { return { id:r.id, reviews:[] }; }
        })
      );
      const reviewMap: Record<string,Review[]> = {};
      reviewResults.forEach(({id,reviews}) => { reviewMap[id]=reviews; });
      setAllReviews(reviewMap);

      const scoreRes = await fetch("/api/recommend", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ profile, waitTimes:live, historicalWaits:hist, reviews:reviewMap }),
      });
      const scoreList: RideScore[] = (await scoreRes.json()).scores ?? [];
      setScores(scoreList);

      const itinRes = await fetch("/api/itinerary", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ profile, scores:scoreList, historicalWaits:hist, liveWaits:live, currentArea:area }),
      });
      const itinData = await itinRes.json();
      setItinerary(itinData.itinerary??[]);
      setIsToday(itinData.isToday??false);
      setParkHours(itinData.parkHours??null);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("加载失败:", e);
    } finally {
      setLoading(false);
      setReplanning(false);
    }
  }

  // ─── 长按逻辑 ──────────────────────────────────────────────────────────────
  const handlePressStart = useCallback((item: ItineraryItem, index: number) => {
    if (item.type === "walk" || item.isAnchor) return;
    longPressTimer.current = setTimeout(() => {
      setLongPressItem(item);
      setLongPressIndex(index);
      setShowSwapSheet(true);
    }, 600);
  }, []);

  const handlePressEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleDelete = () => {
    setItinerary((prev) => resequenceItinerary(prev.filter((_, i) => i !== longPressIndex)));
    setShowSwapSheet(false);
  };

  const handleMoveUp = () => {
    setItinerary((prev) => {
      const arr = [...prev];
      if (longPressIndex > 0) [arr[longPressIndex-1], arr[longPressIndex]] = [arr[longPressIndex], arr[longPressIndex-1]];
      // 交换位置后必须重排时间，否则会出现"22:00 的下一项是 11:00"
      return resequenceItinerary(arr);
    });
    setShowSwapSheet(false);
  };

  const handleMoveDown = () => {
    setItinerary((prev) => {
      const arr = [...prev];
      if (longPressIndex < arr.length-1) [arr[longPressIndex], arr[longPressIndex+1]] = [arr[longPressIndex+1], arr[longPressIndex]];
      return resequenceItinerary(arr);
    });
    setShowSwapSheet(false);
  };

  // 换一个：按评分+等待时间排序显示备选
  const swapCandidates = scores
    .filter((s) => s.rideId !== longPressItem?.itemId && s.priority !== "skip" && s.recommended)
    .sort((a,b) => {
      const rideA = rides.find((r)=>r.id===a.rideId);
      const rideB = rides.find((r)=>r.id===b.rideId);
      const scoreA = a.overallScore - (rideA?.waitTime??30)*0.3;
      const scoreB = b.overallScore - (rideB?.waitTime??30)*0.3;
      return scoreB - scoreA;
    })
    .slice(0, 6);

  const handleSwap = (newRideId: string) => {
    const ride = rides.find((r)=>r.id===newRideId);
    if (!ride || !longPressItem) return;
    const score = scores.find((s)=>s.rideId===newRideId);
    setItinerary((prev) => {
      const arr = [...prev];
      arr[longPressIndex] = {
        ...longPressItem,
        itemId: ride.id,
        itemName: ride.name,
        area: ride.areaName,
        estimatedWait: ride.waitTime ?? 30,
        duration: ride.rideDuration,
        note: score?.reasoning ?? ride.description.slice(0,50),
        type: "ride",
      };
      return arr;
    });
    setShowSwapSheet(false);
  };

  // ─── 点击跳转详情 ──────────────────────────────────────────────────────────
  const handleItemClick = (item: ItineraryItem) => {
    if (item.type === "walk" || item.type === "rest") return;
    if (item.type === "photo") { router.push(`/photo/${item.itemId}`); return; }
    if (item.type === "shop") { router.push(`/shop/${item.itemId}`); return; }
    if (item.type === "meal") { router.push(`/restaurant/${item.itemId}`); return; }
    if (item.type === "ride" || item.type === "show") { router.push(`/rides/${item.itemId}`); return; }
  };

  const filteredRides = rides
    .map((r) => ({ ride:r, score:scores.find((s)=>s.rideId===r.id), reviews:allReviews[r.id]??[] }))
    .filter(({ score }) => { const p=FILTER_MAP[filter]; return p===null||score?.priority===p; })
    .sort((a,b) => (b.score?.overallScore??0)-(a.score?.overallScore??0));

  const mustDo = scores.filter((s)=>s.priority==="must-do").length;
  const park   = getParkById(profile?.park??"shanghai");
  if (!profile) return null;
  const ModeIcon = MODE_ICON[profile.mode] ?? Coffee;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏰</span>
            <div>
              <div className="font-semibold text-sm">迪士尼乐园智能助手</div>
              <div className="flex items-center gap-1 text-white/40 text-xs">
                <MapPin className="w-3 h-3" />{park?.name}
                {isToday && <span className="ml-1 text-emerald-400">● 实时</span>}
                {parkHours && <span className="ml-1 text-white/30">{parkHours.open}–{parkHours.close}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {isToday && (
              <button onClick={() => setShowAreaPicker(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium transition-all">
                <Navigation className="w-3 h-3" /> 重新规划
              </button>
            )}
            <button onClick={() => router.push("/onboarding")}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 区域选择弹窗 */}
      {showAreaPicker && park && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center p-4">
          <div className="w-full max-w-lg bg-slate-800 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-white">你现在在哪个区域？</h3>
                <p className="text-white/40 text-xs mt-0.5">AI 从你的位置重新规划最优路线</p>
              </div>
              <button onClick={() => setShowAreaPicker(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {park.areas.map((area) => (
                <button key={area.id} onClick={() => { setShowAreaPicker(false); setReplanning(true); setTab("itinerary"); loadAllData(area.id); }}
                  className="flex items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 hover:border-blue-400 hover:bg-blue-500/10 text-left transition-all">
                  <span className="text-xl">{area.emoji}</span>
                  <span className="text-sm text-white font-medium">{area.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 长按操作 Bottom Sheet */}
      {showSwapSheet && longPressItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center">
          <div className="w-full max-w-lg bg-slate-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-white text-sm">{longPressItem.itemName}</h3>
                <p className="text-white/40 text-xs mt-0.5">{longPressItem.time} · {longPressItem.area}</p>
              </div>
              <button onClick={() => setShowSwapSheet(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 操作按钮 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button onClick={handleDelete}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-red-500/15 border border-red-500/20 hover:bg-red-500/25 transition-all">
                <Trash2 className="w-5 h-5 text-red-400" />
                <span className="text-xs text-red-300">删除</span>
              </button>
              <button onClick={handleMoveUp} disabled={longPressIndex <= 0}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-all">
                <ArrowUp className="w-5 h-5 text-white/60" />
                <span className="text-xs text-white/50">上移</span>
              </button>
              <button onClick={handleMoveDown} disabled={longPressIndex >= itinerary.length-1}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-all">
                <ArrowDown className="w-5 h-5 text-white/60" />
                <span className="text-xs text-white/50">下移</span>
              </button>
            </div>

            {/* 换一个 */}
            {swapCandidates.length > 0 && (
              <>
                <p className="text-white/50 text-xs mb-2 flex items-center gap-1">
                  <RefreshCcw className="w-3 h-3" /> 换成以下项目（综合评分 + 等待时间排序）
                </p>
                <div className="space-y-2">
                  {swapCandidates.map((s) => {
                    const ride = rides.find((r)=>r.id===s.rideId);
                    if (!ride) return null;
                    return (
                      <button key={s.rideId} onClick={() => handleSwap(s.rideId)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-blue-400 hover:bg-blue-500/10 text-left transition-all">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{ride.name}</div>
                          <div className="text-xs text-white/40 mt-0.5">{ride.areaName}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-sm font-bold ${s.overallScore>=70?"text-emerald-400":s.overallScore>=50?"text-amber-400":"text-white/40"}`}>{s.overallScore}分</div>
                          <div className={`text-xs ${(ride.waitTime??0)<=20?"text-emerald-400":(ride.waitTime??0)<=45?"text-amber-400":"text-red-400"}`}>{ride.waitTime??'?'}分钟</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/20" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* 档案摘要 */}
        <div className="flex items-center gap-2 mb-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 flex-wrap">
          <ModeIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-blue-200 text-sm font-medium">{MODE_LABEL[profile.mode]}</span>
          <span className="text-white/30 text-xs">{ROUTE_LABEL[profile.routeProfile]}</span>
          <span className="text-white/30 text-xs">{profile.arrivalTime}–{profile.departureTime}</span>
          {profile.llPackage !== "none" && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">⚡{profile.llPackage}</span>}
          {profile.watchParade    && <span className="text-xs bg-pink-500/20   text-pink-300   px-1.5 py-0.5 rounded-full">🎠</span>}
          {profile.watchFireworks && <span className="text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">🎆</span>}
          <span className="ml-auto text-white/30 text-xs">{profile.visitDate}</span>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label:"必玩项目", value:loading?"—":`${mustDo}个`,         icon:Sparkles, color:"text-emerald-400" },
            { label:"数据来源", value:isToday?"实时+预测":"历史预测",      icon:Clock,    color:"text-blue-400"   },
            { label:"更新时间", value:lastUpdated?lastUpdated.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"—", icon:RefreshCw, color:"text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/50 rounded-xl p-3 text-center">
              <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
              <div className="font-bold text-base">{s.value}</div>
              <div className="text-white/40 text-xs">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-800/50 p-1 rounded-xl">
          {(["itinerary","rides","agent"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${tab===t?"bg-blue-500 text-white":"text-white/40 hover:text-white/60"}`}>
              {t==="agent" && <Bot className="w-3.5 h-3.5" />}
              {t==="rides"?"项目推荐":t==="itinerary"?"今日行程":"AI助手"}
            </button>
          ))}
        </div>

        {/* 今日行程 */}
        {tab==="itinerary" && (
          <div>
            {loading||replanning ? (
              <div className="space-y-3">
                <div className="text-center py-4 text-blue-300 text-sm animate-pulse">
                  {replanning?"🗺️ 正在根据你的位置重新规划…":"⏳ 规划行程中…"}
                </div>
                {[...Array(6)].map((_,i)=><div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />)}
              </div>
            ) : itinerary.length===0 ? (
              <div className="text-center py-12 text-white/30">
                <CalendarCheck className="w-8 h-8 mx-auto mb-2" />
                <p>暂无行程，请检查偏好设置</p>
              </div>
            ) : (
              <div>
                <p className="text-white/30 text-xs mb-3 text-center">长按行程卡片可删除、移动或替换项目</p>
                <div className="relative">
                  <div className="absolute left-[58px] top-0 bottom-0 w-px bg-white/5" />
                  {itinerary.map((item, i) => {
                    const cfg = ITEM_CONFIG[item.type] ?? ITEM_CONFIG.ride;
                    const isClickable = !["walk","rest","parade","fireworks"].includes(item.type);
                    const isLongPressable = !item.isAnchor && item.type !== "walk";

                    if (item.type==="walk") return (
                      <div key={i} className="flex gap-4 py-1.5">
                        <div className="w-14 text-right flex-shrink-0">
                          <div className="text-white/25 text-xs font-mono">{item.time}</div>
                        </div>
                        <div className="relative flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full border mt-1.5 ${cfg.dot}`} />
                        </div>
                        <div className="flex-1 flex items-center gap-2 py-0.5">
                          <span className="text-xs text-white/30">🚶 步行至 {item.area}</span>
                          <span className="text-xs text-white/20">{item.walkMinutes}分钟</span>
                        </div>
                      </div>
                    );

                    return (
                      <div key={i} className="flex gap-4 py-2"
                        onMouseDown={() => handlePressStart(item, i)}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                        onTouchStart={() => handlePressStart(item, i)}
                        onTouchEnd={handlePressEnd}>
                        <div className="w-14 text-right flex-shrink-0 font-mono">
                          <div className="text-white/60 text-xs">{item.time}</div>
                          <div className="text-white/25 text-xs">→{item.endTime}</div>
                        </div>
                        <div className="relative flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full border-2 mt-1 ${cfg.dot} ${item.isAnchor?"ring-2 ring-yellow-400/50":""}${item.hasReservedSpot?" ring-2 ring-purple-400/50":""}`} />
                        </div>
                        <div
                          onClick={() => isClickable && handleItemClick(item)}
                          className={`flex-1 rounded-xl px-3 py-2.5 ${cfg.bg} ${isClickable?"cursor-pointer":""} ${isLongPressable?"select-none":""} transition-all`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-base flex-shrink-0">{cfg.icon}</span>
                              <span className="text-sm font-medium text-white leading-snug">{item.itemName}</span>
                            </div>
                            <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                              {item.isAnchor && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">锚点</span>}
                              {item.hasReservedSpot && <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">预留位</span>}
                              {item.isSoftAnchor && <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">推荐</span>}
                              {item.llType && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">[LL]</span>}
                              {item.singleRiderTip && <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">SR</span>}
                              {item.requiresReservation && <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">⚠️预约</span>}
                              {isClickable && <ChevronRight className="w-3.5 h-3.5 text-white/20 mt-0.5" />}
                            </div>
                          </div>
                          <div className="flex gap-3 mt-0.5 flex-wrap">
                            {item.area && <span className="text-xs text-white/30">{item.area}</span>}
                            {item.estimatedWait>0 && <span className="text-xs text-white/30">⏱️{item.estimatedWait}分</span>}
                            {item.duration>0 && <span className="text-xs text-white/30">🕐{item.duration}分</span>}
                          </div>
                          {item.note && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{item.note}</p>}
                          {item.photoTips && <p className="text-xs text-pink-300/70 mt-1">{item.photoTips}</p>}
                          {item.shopTips  && <p className="text-xs text-emerald-300/70 mt-1">{item.shopTips}</p>}
                          {item.requiresReservation && <p className="text-xs text-red-300/70 mt-1">⚠️ 需提前在迪士尼官方 App 预约</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 项目推荐 */}
        {tab==="rides" && (
          <>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
              {FILTER_OPTIONS.map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter===f?"bg-white text-slate-900":"bg-white/10 text-white/50 hover:bg-white/15"}`}>
                  {f}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />)}</div>
            ) : (
              <div className="space-y-3">
                {filteredRides.length===0
                  ? <div className="text-center py-12 text-white/30">没有符合条件的项目</div>
                  : filteredRides.map(({ride,score,reviews}) => <RideCard key={ride.id} ride={ride} score={score} reviews={reviews} />)}
              </div>
            )}
          </>
        )}

        {/* AI Agent 对话 */}
        {tab==="agent" && (
          <div className="h-[600px] rounded-2xl overflow-hidden border border-white/10">
            <AgentChat />
          </div>
        )}

        {lastUpdated && tab!=="agent" && (
          <p className="text-center text-white/20 text-xs mt-6 mb-2">
            {isToday?"实时+历史预测":"历史数据预测"} · TSP最优动线 · Claude AI分析
          </p>
        )}
      </div>
    </div>
  );
}
