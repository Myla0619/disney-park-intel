"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProfileStore } from "@/lib/store";
import { getRidesByPark, getParkById } from "@/lib/parks-data";
import { resequenceItinerary } from "@/lib/routing";
import { todayInPark } from "@/lib/park-time";
import LocateMeButton from "@/components/LocateMeButton";
import { useWishlistStore } from "@/lib/wishlist-store";
import { scoreRidesLocally } from "@/lib/local-scoring";
import { usePlanStore, planFingerprint, isPlanUsable } from "@/lib/plan-store";
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

/**
 * 行程条目的类型配色。
 *
 * 每类给一条左侧色带 + 对应色的时间轴圆点，一眼就能看出一天由什么构成——
 * 哪段在玩项目、哪段在拍照、哪里插了餐和演出。此前除餐食外几乎都是同一个深灰，
 * 整条时间轴读起来是一片平的。
 */
const ITEM_CONFIG: Record<string, { dot: string; icon: string; bg: string }> = {
  ride:      { dot:"border-magic-400 bg-magic-400 shadow-[0_0_10px_rgba(168,85,247,.8)]",  icon:"🎢", bg:"border-l-2 border-l-magic-400 bg-magic-500/[0.07] hover:bg-magic-500/[0.14]" },
  walk:      { dot:"border-white/20 bg-white/10",                                          icon:"🚶", bg:"bg-transparent" },
  meal:      { dot:"border-castle-400 bg-castle-400 shadow-[0_0_10px_rgba(251,191,36,.8)]", icon:"🍽️", bg:"border-l-2 border-l-castle-400 bg-castle-500/[0.12] hover:bg-castle-500/[0.18]" },
  photo:     { dot:"border-spark-400 bg-spark-400 shadow-[0_0_10px_rgba(236,72,153,.8)]",   icon:"📸", bg:"border-l-2 border-l-spark-400 bg-spark-500/[0.12] hover:bg-spark-500/[0.18]" },
  shop:      { dot:"border-meadow-400 bg-meadow-400 shadow-[0_0_10px_rgba(52,211,153,.8)]", icon:"🛍️", bg:"border-l-2 border-l-meadow-400 bg-meadow-500/[0.10] hover:bg-meadow-500/[0.16]" },
  show:      { dot:"border-lagoon-400 bg-lagoon-400 shadow-[0_0_10px_rgba(34,211,238,.8)]", icon:"🎭", bg:"border-l-2 border-l-lagoon-400 bg-lagoon-500/[0.10] hover:bg-lagoon-500/[0.16]" },
  // 巡游与烟花是当天的高光时刻，用最强的渐变把它们从时间轴上凸出来
  parade:    { dot:"border-castle-300 bg-castle-300 shadow-[0_0_14px_rgba(252,211,77,.95)]", icon:"🎠", bg:"border-l-2 border-l-castle-300 bg-gradient-to-r from-castle-500/25 to-spark-500/15" },
  fireworks: { dot:"border-spark-400 bg-spark-400 shadow-[0_0_14px_rgba(236,72,153,.95)]",   icon:"🎆", bg:"border-l-2 border-l-spark-400 bg-gradient-to-r from-spark-500/25 to-magic-500/20" },
  rest:      { dot:"border-white/25 bg-white/20",                                            icon:"☕", bg:"bg-white/[0.04]" },
};

type Tab = "itinerary" | "rides" | "agent";

export default function DashboardPage() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const hasHydrated = useProfileStore((s) => s.hasHydrated);
  const wishlist = useWishlistStore((s) => s.ids);
  /** 渐进式加载所处阶段，用于告诉用户当前这版行程还会不会变 */
  const [stage, setStage] = useState<"planning" | "refining" | "polishing" | "done">("planning");
  const cachedPlan = usePlanStore((s) => s.plan);
  const planHydrated = usePlanStore((s) => s.hasHydrated);
  const savePlan = usePlanStore((s) => s.save);

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
    // 等 localStorage 水合完成再判断。否则首帧 profile 恒为 null，
    // 每次打开都会被弹回 Onboarding 重填一遍
    if (!hasHydrated || !planHydrated) return;
    if (!profile) { router.push("/onboarding"); return; }
    // 按园区时区判断是否为当天，而不是设备时区
    setIsToday(profile.visitDate === todayInPark(profile.park));

    // 什么都没改就别重算：点进项目详情再返回、切标签、误触后退都会让本组件
    // 重新挂载，此前每次都要整轮重新规划一遍
    const fp = planFingerprint(profile, wishlist, "entrance");
    if (isPlanUsable(cachedPlan, fp)) {
      setItinerary(cachedPlan!.itinerary);
      setScores(cachedPlan!.scores);
      setParkHours(cachedPlan!.parkHours);
      setIsToday(cachedPlan!.isToday);
      setLastUpdated(new Date(cachedPlan!.computedAt));
      setRides(getRidesByPark(profile.park));
      setLoading(false);
      setStage("done");
      return;
    }

    loadAllData("entrance");
    // wishlist 变化要重新规划：用户刚勾的项目应当立刻出现在行程里
  }, [profile, hasHydrated, planHydrated, wishlist]);

  /**
   * 渐进式加载。
   *
   * 此前是一条全串行链：等待时间 → 24 次评论请求 → Claude 评分(20s) →
   * Claude 润色(20s)，而且**全部跑完才渲染**，首屏要等 60 秒。人在园区里
   * 掏出手机等一分钟是不可接受的。
   *
   * 现在分三段，每段完成就立刻更新界面：
   *   1. 等待时间 + 本地规则评分 → 出一版可用行程（约 2 秒）
   *   2. 评论批量拉取 + Claude 评分 → 重排行程
   *   3. Claude 润色备注 → 合并进现有行程
   * 任一后续阶段失败都不影响已经显示的行程。
   */
  async function loadAllData(area: string) {
    if (!profile) return;
    setLoading(true);
    setStage("planning");

    const rideList = getRidesByPark(profile.park);
    setRides(rideList);

    try {
      const todayMode = profile.visitDate === todayInPark(profile.park);

      // ── 第一段：等待时间 + 本地规则评分，立刻出行程 ──────────────────
      const [wtRes, histRes] = await Promise.all([
        fetch(`/api/waittimes?park=${profile.park}`),
        fetch(`/api/waittimes?park=${profile.park}&mode=historical&date=${profile.visitDate}`),
      ]);
      const live: LiveWaitData[] = (await wtRes.json()).data ?? [];
      const hist: HistoricalWaitData[] = (await histRes.json()).data ?? [];
      setLiveWaits(live);
      setHistoricalWaits(hist);

      const enriched = rideList.map((r) => {
        const h = hist.find((w) => w.rideId === r.id);
        const l = live.find((w) => w.rideId === r.id);
        return { ...r, waitTime: (todayMode ? l?.waitMinutes : null) ?? h?.predictedWait ?? r.waitTime };
      });
      setRides(enriched);

      const quickScores = scoreRidesLocally(enriched, profile);
      setScores(quickScores);

      const planWith = async (scoreList: RideScore[], polish: boolean) => {
        const res = await fetch("/api/itinerary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile, scores: scoreList, historicalWaits: hist, liveWaits: live,
            currentArea: area, wishlist, polishNotes: polish,
          }),
        });
        return res.json();
      };

      const quickPlan = await planWith(quickScores, false);
      setItinerary(quickPlan.itinerary ?? []);
      setIsToday(quickPlan.isToday ?? false);
      setParkHours(quickPlan.parkHours ?? null);
      setLastUpdated(new Date());
      setLoading(false); // 已有可用行程，先让用户看到
      setStage("refining");
      savePlan({
        fingerprint: planFingerprint(profile, wishlist, area),
        itinerary: quickPlan.itinerary ?? [],
        scores: quickScores,
        parkHours: quickPlan.parkHours ?? null,
        isToday: quickPlan.isToday ?? false,
        stage: "quick",
        computedAt: Date.now(),
      });

      // ── 第二段：评论 + Claude 评分，重排 ────────────────────────────
      let reviewMap: Record<string, Review[]> = {};
      try {
        // 一次批量请求替代 24 个往返
        const res = await fetch(`/api/reviews?rideIds=${rideList.map((r) => r.id).join(",")}`);
        const data = await res.json();
        for (const [id, v] of Object.entries(data.byRide ?? {})) {
          reviewMap[id] = (v as any).reviews ?? [];
        }
        setAllReviews(reviewMap);
      } catch (e) {
        console.error("评论加载失败，沿用无评论的评分:", e);
      }

      const scoreRes = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, waitTimes: live, reviews: reviewMap }),
      });
      const scoreData = await scoreRes.json();
      const aiScores: RideScore[] = scoreData.scores ?? [];

      if (aiScores.length) {
        setScores(aiScores);
        const refined = await planWith(aiScores, false);
        if (refined.itinerary?.length) {
          setItinerary(refined.itinerary);
          setLastUpdated(new Date());
          savePlan({
            fingerprint: planFingerprint(profile, wishlist, area),
            itinerary: refined.itinerary,
            scores: aiScores,
            parkHours: refined.parkHours ?? null,
            isToday: refined.isToday ?? false,
            stage: "refined",
            computedAt: Date.now(),
          });
        }

        // ── 第三段：润色备注，合并进现有行程 ──────────────────────────
        setStage("polishing");
        try {
          const polished = await planWith(aiScores, true);
          if (polished.itinerary?.length) {
            setItinerary(polished.itinerary);
            savePlan({
              fingerprint: planFingerprint(profile, wishlist, area),
              itinerary: polished.itinerary,
              scores: aiScores,
              parkHours: polished.parkHours ?? null,
              isToday: polished.isToday ?? false,
              stage: "polished",
              computedAt: Date.now(),
            });
          }
        } catch (e) {
          console.error("备注润色失败，保留未润色行程:", e);
        }
      }
    } catch (e) {
      console.error("加载失败:", e);
    } finally {
      setLoading(false);
      setReplanning(false);
      setStage("done");
    }
  }

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
    <div className="min-h-screen bg-night-900 text-white">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 bg-night-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏰</span>
            <div>
              <div className="font-semibold text-sm">迪士尼乐园智能助手</div>
              <div className="flex items-center gap-1 text-white/40 text-xs">
                <MapPin className="w-3 h-3" />{park?.name}
                {isToday && <span className="ml-1 text-meadow-400">● 实时</span>}
                {parkHours && <span className="ml-1 text-white/30">{parkHours.open}–{parkHours.close}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {isToday && (
              <button onClick={() => setShowAreaPicker(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-meadow-500/20 hover:bg-meadow-500/30 text-meadow-400 text-xs font-medium transition-all">
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
          <div className="w-full max-w-lg bg-night-800 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-white">你现在在哪个区域？</h3>
                <p className="text-white/40 text-xs mt-0.5">AI 从你的位置重新规划最优路线</p>
              </div>
              <button onClick={() => setShowAreaPicker(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20">
                <X className="w-4 h-4" />
              </button>
            </div>
            <LocateMeButton
              areaNameOf={(id) => park.areas.find((a) => a.id === id)?.name ?? id}
              onLocated={(id) => {
                setShowAreaPicker(false);
                setReplanning(true);
                setTab("itinerary");
                loadAllData(id);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              {park.areas.map((area) => (
                <button key={area.id} onClick={() => { setShowAreaPicker(false); setReplanning(true); setTab("itinerary"); loadAllData(area.id); }}
                  className="flex items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 hover:border-magic-400 hover:bg-magic-500/10 text-left transition-all">
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
          <div className="w-full max-w-lg bg-night-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
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
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-ember-500/15 border border-ember-500/20 hover:bg-ember-500/25 transition-all">
                <Trash2 className="w-5 h-5 text-ember-400" />
                <span className="text-xs text-ember-400">删除</span>
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
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-magic-400 hover:bg-magic-500/10 text-left transition-all">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{ride.name}</div>
                          <div className="text-xs text-white/40 mt-0.5">{ride.areaName}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-sm font-bold ${s.overallScore>=70?"text-meadow-400":s.overallScore>=50?"text-castle-400":"text-white/40"}`}>{s.overallScore}分</div>
                          <div className={`text-xs ${(ride.waitTime??0)<=20?"text-meadow-400":(ride.waitTime??0)<=45?"text-castle-400":"text-ember-400"}`}>{ride.waitTime??'?'}分钟</div>
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
        <div className="flex items-center gap-2 mb-3 bg-magic-500/10 border border-magic-500/20 rounded-xl px-3 py-2 flex-wrap">
          <ModeIcon className="w-4 h-4 text-magic-400 flex-shrink-0" />
          <span className="text-magic-200 text-sm font-medium">{MODE_LABEL[profile.mode]}</span>
          <span className="text-white/30 text-xs">{ROUTE_LABEL[profile.routeProfile]}</span>
          <span className="text-white/30 text-xs">{profile.arrivalTime}–{profile.departureTime}</span>
          {profile.llPackage !== "none" && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">⚡{profile.llPackage}</span>}
          {profile.watchParade    && <span className="text-xs bg-spark-500/20   text-spark-300   px-1.5 py-0.5 rounded-full">🎠</span>}
          {profile.watchFireworks && <span className="text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">🎆</span>}
          <span className="ml-auto text-white/30 text-xs">{profile.visitDate}</span>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label:"必玩项目", value:loading?"—":`${mustDo}个`,         icon:Sparkles, color:"text-meadow-400" },
            { label:"数据来源", value:isToday?"实时+预测":"历史预测",      icon:Clock,    color:"text-magic-400"   },
            { label:"更新时间", value:lastUpdated?lastUpdated.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"—", icon:RefreshCw, color:"text-castle-400" },
          ].map((s) => (
            <div key={s.label} className="bg-night-800/55 rounded-xl p-3 text-center">
              <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
              <div className="font-bold text-base">{s.value}</div>
              <div className="text-white/40 text-xs">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-night-800/55 p-1 rounded-xl">
          {(["itinerary","rides","agent"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${tab===t?"bg-magic-gradient text-white shadow-glow":"text-white/45 hover:text-white/70"}`}>
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
                <div className="text-center py-4 text-magic-300 text-sm animate-pulse">
                  {replanning?"🗺️ 正在根据你的位置重新规划…":"⏳ 规划行程中…"}
                </div>
                {[...Array(6)].map((_,i)=><div key={i} className="h-16 bg-night-800/55 rounded-xl animate-pulse" />)}
              </div>
            ) : itinerary.length===0 ? (
              <div className="text-center py-12 text-white/30">
                <CalendarCheck className="w-8 h-8 mx-auto mb-2" />
                <p>暂无行程，请检查偏好设置</p>
              </div>
            ) : (
              <div>
                {stage !== "done" && (
                  <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-magic-400/25 bg-magic-500/10 px-3 py-2 text-xs text-magic-200/90">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {stage === "refining"
                      ? "已按等待时间排出初版，AI 正在结合评论重新评分…"
                      : "正在补充每项的实用备注…"}
                  </div>
                )}
                <p className="text-white/30 text-xs mb-3 text-center">长按行程卡片可删除、移动或替换项目</p>
                <div className="relative">
                  <div className="absolute left-[58px] top-0 bottom-0 w-px bg-gradient-to-b from-magic-400/30 via-white/10 to-spark-400/25" />
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
                              {item.isSoftAnchor && <span className="text-xs bg-castle-500/20 text-castle-300 px-1.5 py-0.5 rounded">推荐</span>}
                              {item.llType && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">[LL]</span>}
                              {item.singleRiderTip && <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">SR</span>}
                              {item.requiresReservation && <span className="text-xs bg-ember-500/20 text-ember-400 px-1.5 py-0.5 rounded">⚠️预约</span>}
                              {isClickable && <ChevronRight className="w-3.5 h-3.5 text-white/20 mt-0.5" />}
                            </div>
                          </div>
                          <div className="flex gap-3 mt-0.5 flex-wrap">
                            {item.area && <span className="text-xs text-white/30">{item.area}</span>}
                            {item.estimatedWait>0 && <span className="text-xs text-white/30">⏱️{item.estimatedWait}分</span>}
                            {item.duration>0 && <span className="text-xs text-white/30">🕐{item.duration}分</span>}
                          </div>
                          {item.note && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{item.note}</p>}
                          {item.photoTips && <p className="text-xs text-spark-300/70 mt-1">{item.photoTips}</p>}
                          {item.shopTips  && <p className="text-xs text-meadow-400/70 mt-1">{item.shopTips}</p>}
                          {item.requiresReservation && <p className="text-xs text-ember-400/70 mt-1">⚠️ 需提前在迪士尼官方 App 预约</p>}
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
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter===f?"bg-white text-night-950":"bg-white/10 text-white/50 hover:bg-white/15"}`}>
                  {f}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-24 bg-night-800/55 rounded-xl animate-pulse" />)}</div>
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
