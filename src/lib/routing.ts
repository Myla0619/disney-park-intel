/**
 * TSP Greedy Routing Algorithm
 * 
 * 边缘情况修复记录：
 * - 花车/烟花时间重叠：自动调整烟花提前时间，避免与花车冲突
 * - 锚点在入园时间之前：自动跳过该锚点
 * - 锚点在离园时间之后：自动跳过该锚点  
 * - 游玩时间极短（<1小时）：只返回1个最高优先级项目
 * - thrill模式无刺激项目可用：降级到全部项目
 * - family模式孩子太小导致候选池为空：放宽身高过滤
 * - Multi Pass 90分钟边界：严格使用 >= 90，不用 > 90
 * - Single Pass 时间窗口已过：跳过 SP 折扣，使用正常等待时间
 * - VIP套餐所有项目都有LL：每项 effectiveWait = 5min
 */

import {
  Ride, PhotoSpot, ShopSpot, Restaurant, RideScore,
  HistoricalWaitData, LiveWaitData, UserProfile,
  ItineraryItem, RouteWeights, ParkHours
} from "@/types";
import {
  walkTime, getParkById, estimateParkHours,
  getPhotoSpots, getShopSpots, getRestaurants
} from "./parks-data";
import { getUserLLRides, hasReservedSpot, getPackageById } from "./ll-packages";
import { isHeightBlocked } from "./height";

// ─── 시간 도구 ────────────────────────────────────────────────────────────────
export function timeToMin(t: string): number {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToTime(m: number): string {
  const clamped = Math.max(0, Math.min(m, 1439)); // 00:00 - 23:59
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ─── 权重配置 ─────────────────────────────────────────────────────────────────
function getWeights(profile: UserProfile): RouteWeights {
  switch (profile.routeProfile) {
    case "efficient": return { waitWeight: 0.7, walkWeight: 0.2, energyWeight: 0.1 };
    case "easy":      return { waitWeight: 0.3, walkWeight: 0.5, energyWeight: 0.2 };
    default:          return { waitWeight: 0.5, walkWeight: 0.3, energyWeight: 0.2 };
  }
}

// ─── 有效等待时间（含优速通折扣）────────────────────────────────────────────
export function getEffectiveWait(
  ride: Ride, profile: UserProfile,
  hist: HistoricalWaitData[], live: LiveWaitData[],
  currentMin: number
): number {
  const h = hist.find((w) => w.rideId === ride.id);
  const l = live.find((w) => w.rideId === ride.id);
  // 实测值优先于预测值：live 是当下真实排队，hist 只是由快照外推的估计。
  // 反过来会让"今天入园"的行程被启发式覆盖掉真实数据。
  let base = l?.waitMinutes ?? h?.predictedWait ?? ride.waitTime ?? 30;

  // 边缘情况：base 异常值保护
  if (isNaN(base) || base < 0) base = 30;
  if (base > 240) base = 240; // 超过4小时的数据视为异常

  const pkg = getPackageById(profile.llPackage);

  // VIP33：所有项目无限次，等待时间视为5分钟
  if (pkg?.unlimited && ride.llEligible) return 5;

  const llRides = getUserLLRides({
    llPackage: profile.llPackage,
    singlePassRides: profile.singlePassRides,
    bundle3Rides: profile.bundle3Rides,
  });

  // ride.llEligible 与套餐清单必须同时成立才给折扣：套餐清单是"这张卡覆盖哪些项目"，
  // llEligible 是"这个项目是否支持尊享卡"，缺任一条都不该打折。
  if (ride.llEligible && llRides.includes(ride.id)) {
    // Single Pass 时间窗口检查
    // 如果用户有 Single Pass 且有时间窗口限制，检查当前时间是否在窗口内
    const spWindow = (profile as any).singlePassWindows?.[ride.id];
    if (spWindow && profile.llPackage === "single") {
      const winStart = timeToMin(spWindow.start);
      const winEnd   = timeToMin(spWindow.end);
      // 边缘情况：时间窗口已过，不享受折扣
      if (currentMin > winEnd) return base;
      // 时间窗口未到，等待时间加上距窗口开始的时间
      if (currentMin < winStart) return base; // 还没到窗口，用正常排队
    }
    return Math.round(base * 0.15);
  }

  return base;
}

function cost(wait: number, walk: number, thrill: number, w: RouteWeights) {
  return w.waitWeight * wait + w.walkWeight * walk + w.energyWeight * thrill * 5;
}

// ─── 营业时间 ─────────────────────────────────────────────────────────────────
export async function getParkHours(
  parkId: string, visitDate: string, isToday: boolean
): Promise<ParkHours> {
  if (isToday) {
    try {
      const park = getParkById(parkId);
      if (!park) throw new Error("unknown park");
      const res = await fetch(
        `https://api.themeparks.wiki/v1/entity/${park.theparksApiId}/schedule`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) throw new Error(`schedule ${res.status}`);
      const data = await res.json();
      const today = data.schedule?.find(
        (s: any) => s.date === visitDate && s.type === "OPERATING"
      );
      if (today) {
        return {
          open:  today.openingTime.slice(11, 16),
          close: today.closingTime.slice(11, 16),
          source: "live",
        };
      }
    } catch {}
  }
  return estimateParkHours(visitDate);
}

// ─── 锚点构建（含边缘情况修复）──────────────────────────────────────────────
export function buildAnchors(profile: UserProfile, parkHours: ParkHours): ItineraryItem[] {
  const anchors: ItineraryItem[] = [];
  const reserved    = hasReservedSpot(profile.llPackage);
  const arrMin      = timeToMin(profile.arrivalTime);
  const depMin      = timeToMin(profile.departureTime);
  const openMin     = timeToMin(parkHours.open);
  const effectiveStart = Math.max(arrMin, openMin);

  const paradePreMin    = reserved ? 10 : 20;
  const fireworksPreMin = reserved ? 15 : 30;

  // 花车锚点
  if (profile.watchParade && profile.paradeTime) {
    const [h, m] = profile.paradeTime.split(":").map(Number);
    const paradeStart = h * 60 + m;
    const anchorStart = paradeStart - paradePreMin;

    // 边缘情况1：花车时间在入园前 → 跳过
    if (paradeStart <= effectiveStart) {
      console.warn(`[routing] 花车时间 ${profile.paradeTime} 在入园前，跳过`);
    }
    // 边缘情况2：花车时间在离园后 → 跳过
    // 用 > 而非 >=：把离园时间设成和演出同一时刻（"看完就走"）是最常见的填法，
    // 用 >= 会把用户明确勾选的演出静默丢掉
    else if (paradeStart > depMin) {
      console.warn(`[routing] 花车时间 ${profile.paradeTime} 在离园后，跳过`);
    }
    else {
      const paradeEnd = paradeStart + 30;
      const note =
        (reserved
          ? `已购套餐含花车预留区，凭套票前往官方指定区域，请查当日集合通知。${profile.paradeTime}正式出发，约30分钟。`
          : `提前${paradePreMin}分钟到玩具总动员区域占位，互动概率最高。${profile.paradeTime}正式出发，约30分钟。时间以官方App为准。`) +
        (paradeEnd > depMin ? `⚠️ 结束时间晚于你设定的离园时间 ${profile.departureTime}。` : "");
      anchors.push({
        time: minToTime(anchorStart),
        endTime: minToTime(paradeStart + 30),
        itemId: "parade", itemName: "🎠 花车巡游",
        area: "米奇大街", estimatedWait: 0, walkMinutes: 0,
        duration: 30 + paradePreMin, note,
        type: "parade", isAnchor: true, hasReservedSpot: reserved,
      });
    }
  }

  // 烟花锚点
  if (profile.watchFireworks && profile.fireworksTime) {
    const [h, m] = profile.fireworksTime.split(":").map(Number);
    const fireworksStart = h * 60 + m;
    let anchorStart = fireworksStart - fireworksPreMin;

    // 边缘情况3：花车和烟花时间重叠 → 自动调整
    const paradeAnchor = anchors.find((a) => a.type === "parade");
    if (paradeAnchor) {
      const paradeEnd = timeToMin(paradeAnchor.endTime);
      if (anchorStart < paradeEnd) {
        // 烟花占位时间与花车冲突，缩短烟花提前时间
        anchorStart = paradeEnd + 5;
        console.warn(`[routing] 花车/烟花时间重叠，烟花占位调整为 ${minToTime(anchorStart)}`);
      }
    }

    // 边缘情况4：烟花时间在入园前或离园后 → 跳过
    if (fireworksStart <= effectiveStart) {
      console.warn(`[routing] 烟花时间 ${profile.fireworksTime} 在入园前，跳过`);
    } else if (fireworksStart > depMin) {
      console.warn(`[routing] 烟花时间 ${profile.fireworksTime} 在离园后，跳过`);
    } else if (anchorStart >= depMin) {
      console.warn(`[routing] 烟花占位时间超出离园时间，跳过`);
    } else {
      const fireworksEnd = fireworksStart + 20;
      const note =
        (reserved
          ? `已购套餐含烟花预留区，凭套票前往官方指定区域，请查当日集合通知。${profile.fireworksTime}开始，约20分钟。`
          : `提前${fireworksPreMin}分钟在城堡正前方占位，${profile.fireworksTime}开始，约20分钟。烟花后立刻去旋转木马，灯光全亮是全天最佳拍照时机。时间以官方App为准。`) +
        (fireworksEnd > depMin ? `⚠️ 结束时间晚于你设定的离园时间 ${profile.departureTime}。` : "");
      anchors.push({
        time: minToTime(anchorStart),
        endTime: minToTime(fireworksStart + 20),
        itemId: "fireworks", itemName: "🎆 奇梦之光幻影秀",
        area: "梦幻世界", estimatedWait: 0, walkMinutes: 0,
        duration: 20 + fireworksPreMin, note,
        type: "fireworks", isAnchor: true, hasReservedSpot: reserved,
      });
    }
  }

  return anchors;
}

// ─── 餐饮时间槽 ──────────────────────────────────────────────────────────────
function getMealSlots(
  profile: UserProfile, openMin: number
): { time: number; mealType: "breakfast" | "lunch" | "dinner" | "snack"; duration: number }[] {
  const arrMin  = timeToMin(profile.arrivalTime);
  const depMin  = timeToMin(profile.departureTime);
  const startMin = Math.max(arrMin, openMin);
  const totalH  = (depMin - startMin) / 60;

  // 边缘情况：游玩时间极短，不插入用餐
  if (totalH < 1.5) return [];

  const dur = profile.diningPreference === "quick" ? 20
            : profile.diningPreference === "fancy"  ? 60 : 45;
  const slots: { time: number; mealType: "breakfast"|"lunch"|"dinner"|"snack"; duration: number }[] = [];

  if (totalH >= 3)  slots.push({ time: 690,  mealType: "lunch",   duration: dur   }); // 11:30
  if (totalH >= 5)  slots.push({ time: 930,  mealType: "snack",   duration: 15    }); // 15:30
  if (totalH >= 8)  slots.push({ time: 1140, mealType: "dinner",  duration: dur   }); // 19:00

  return slots.filter((s) => s.time + s.duration < depMin && s.time > startMin);
}

// ─── 选餐厅 ──────────────────────────────────────────────────────────────────
function pickRestaurant(
  profile: UserProfile, mealType: string,
  restaurants: Restaurant[], usedIds: Set<string>
): Restaurant | null {
  const selected = restaurants.filter(
    (r) => profile.selectedRestaurants.includes(r.id) && !usedIds.has(r.id)
  );
  const pool = selected.length > 0
    ? selected
    : restaurants.filter((r) => !usedIds.has(r.id));

  return pool
    .filter((r) => {
      if (!r.bestMealTime.includes(mealType as any)) return false;
      if (profile.diningPreference === "quick"  && r.type !== "quick") return false;
      if (profile.diningPreference === "fancy"  && r.type === "quick") return false;
      return true;
    })
    .sort((a, b) => {
      const am = a.suitableModes.includes(profile.mode) ? 1 : 0;
      const bm = b.suitableModes.includes(profile.mode) ? 1 : 0;
      return (bm + b.rating) - (am + a.rating);
    })[0] ?? null;
}

// ─── LL 类型标签 ──────────────────────────────────────────────────────────────
function getLLLabel(ride: Ride, profile: UserProfile): "package" | "single" | null {
  const pkg = getPackageById(profile.llPackage);
  if (!pkg || profile.llPackage === "none") return null;
  const llRides = getUserLLRides({
    llPackage: profile.llPackage,
    singlePassRides: profile.singlePassRides,
    bundle3Rides: profile.bundle3Rides,
  });
  if (!llRides.includes(ride.id)) return null;
  return profile.llPackage === "single" ? "single" : "package";
}

// ─── 项目备注生成 ─────────────────────────────────────────────────────────────
function buildRideNote(
  ride: Ride, profile: UserProfile, wait: number, ll: "package" | "single" | null
): string {
  const parts: string[] = [];

  if (ll === "single")  parts.push(`单项尊享卡入场，节省约${Math.round(wait * 5)}分钟排队`);
  else if (ll === "package") parts.push(`套餐尊享卡入场，节省约${Math.round(wait * 4)}分钟`);
  else if (wait >= 60)  parts.push(`预计排队${wait}分钟，可考虑购买尊享卡`);
  else                  parts.push(`预计等待${wait}分钟`);

  if (ride.singleRider) parts.push("💡 可能开放 Single Rider 通道，到场后查 App 或问工作人员");

  if (isHeightBlocked(ride, profile)) {
    parts.push(`⚠️ 注意：部分孩子身高不足 ${ride.heightRequirement}cm`);
  }

  return parts.join("。");
}

// ─── 候选池构建 ──────────────────────────────────────────────────────────────
interface CandidateItem {
  id: string; name: string; area: string;
  type: ItineraryItem["type"];
  wait: number; duration: number; note: string;
  llType: "package" | "single" | null;
  singleRider: boolean;
  costVal: number;
}

function buildCandidates(
  rides: Ride[], scores: RideScore[],
  hist: HistoricalWaitData[], live: LiveWaitData[],
  profile: UserProfile,
  startArea: string, startMin: number, openMin: number,
  priorityFilter: (s: RideScore) => boolean
): CandidateItem[] {
  const weights    = getWeights(profile);
  const isGateRush = startMin <= openMin + 15;

  const filtered = rides.filter((r) => {
    const s = scores.find((sc) => sc.rideId === r.id);
    if (!s || !priorityFilter(s)) return false;
    // 身高刚好等于限制 = 允许（isHeightBlocked 内部按 >= 判定）
    if (isHeightBlocked(r, profile)) return false;
    return true;
  });

  return filtered
    .map((r) => {
      const wait = getEffectiveWait(r, profile, hist, live, startMin);
      const ll   = getLLLabel(r, profile);
      const wk   = walkTime(startArea, r.area, profile);
      const costVal = isGateRush && scores.find((s) => s.rideId === r.id)?.priority === "must-do"
        ? -wait  // 顶门时：等待最长的 must-do 排最前
        : cost(wait, wk, r.thrillScore, weights);
      return {
        id: r.id, name: r.name, area: r.area,
        type: (r.type === "show" ? "show" : "ride") as ItineraryItem["type"],
        wait, duration: r.rideDuration,
        note: buildRideNote(r, profile, wait, ll),
        llType: ll, singleRider: r.singleRider,
        costVal,
      };
    })
    .sort((a, b) => a.costVal - b.costVal);
}

// ─── 时间线构建器 ─────────────────────────────────────────────────────────────
function buildTimeline(
  candidates: CandidateItem[],
  anchors: ItineraryItem[],
  profile: UserProfile,
  startArea: string,
  parkHours: ParkHours
): ItineraryItem[] {
  const result: ItineraryItem[] = [...anchors];
  const restaurants = getRestaurants(profile.park);
  const openMin  = timeToMin(parkHours.open);
  const depMin   = timeToMin(profile.departureTime);
  const startMin = Math.max(timeToMin(profile.arrivalTime), openMin);

  // 边缘情况：游玩时间极短（< 60分钟）→ 只取第一个项目
  const effectiveDep = depMin;
  const totalAvail   = effectiveDep - startMin;
  const maxItems     = totalAvail < 60 ? 1 : 999;

  // 锚点封锁区间（前后各留 5 分钟走位时间）
  const blocked = anchors
    .map((a) => ({
      start: timeToMin(a.time) - 5,
      end: timeToMin(a.endTime) + 5,
      area: a.area,
    }))
    .sort((x, y) => x.start - y.start);

  /** 若时刻落在某个锚点封锁区间内，返回该区间，否则返回 null。 */
  const blockAt = (min: number) => blocked.find((b) => min >= b.start && min < b.end) ?? null;

  // 90 分钟间隔是 Multi Pass 的预约约束（同一时间只能持有一个预约），
  // 无限次套餐（VIP33）不受此限——套用会把 2688 元的无限次卡压成每 90 分钟一项。
  const llUnlimited = getPackageById(profile.llPackage)?.unlimited ?? false;

  const mealSlots   = getMealSlots(profile, openMin);
  const usedMeals   = new Set<string>();
  const usedRests   = new Set<string>();
  const usedItems   = new Set<string>();
  let lastLLMin     = -999;
  let currentArea   = startArea;
  let currentMin    = startMin;
  let itemsAdded    = 0;

  for (const item of candidates) {
    if (itemsAdded >= maxItems) break;

    // 插入餐食
    for (const meal of mealSlots) {
      if (!usedMeals.has(meal.mealType) &&
          currentMin >= meal.time - 20 &&
          currentMin < meal.time + 90) {
        const r = pickRestaurant(profile, meal.mealType, restaurants, usedRests);
        if (r) {
          // 餐食此前不检查锚点区间，于是会排出"烧烤 16:01 结束、巡游 15:25 开始"
          // 这种重叠。和游乐项目一样：撞上锚点就顺延到锚点之后。
          let mealCursor = currentMin;
          const mealBlock = blockAt(mealCursor);
          if (mealBlock) mealCursor = mealBlock.end;

          const wk = walkTime(mealBlock?.area ?? currentArea, r.area, profile);
          const ms = mealCursor + wk;
          const me = ms + r.duration;
          const overlapsAnchor = blocked.some((b) => ms < b.end && me > b.start);
          if (me < depMin && !overlapsAnchor) {
            if (wk > 0) result.push({
              time: minToTime(mealCursor), endTime: minToTime(ms),
              itemId: "walk", itemName: `步行至${r.areaName}`,
              area: r.areaName, estimatedWait: 0, walkMinutes: wk, duration: wk,
              note: `前往${r.name}，约${wk}分钟`, type: "walk",
            });
            result.push({
              time: minToTime(ms), endTime: minToTime(me),
              itemId: r.id, itemName: r.name,
              area: r.areaName, estimatedWait: 0, walkMinutes: 0,
              duration: r.duration, note: r.tips,
              type: "meal", isSoftAnchor: true,
              requiresReservation: r.requiresReservation,
            });
            currentArea = r.area;
            currentMin  = me;
            usedMeals.add(meal.mealType);
            usedRests.add(r.id);
          }
        }
      }
    }

    if (usedItems.has(item.id)) continue;

    // 游标正处在锚点区间内（比如刚好卡在巡游时段），先推到锚点结束再排。
    // 锚点期间人就在锚点位置，当前区域一并更新。
    const nowBlock = blockAt(currentMin);
    if (nowBlock) {
      currentMin = nowBlock.end;
      currentArea = nowBlock.area ?? currentArea;
    }

    let wk = walkTime(currentArea, item.area, profile);
    let arrAt = currentMin + wk;
    let itemEnd = arrAt + item.wait + item.duration;

    // 与锚点重叠时把该项目顺延到锚点之后重排，而不是丢弃它。
    //
    // 此前这里是 `continue`：游标不前进，于是后续每个候选都从锚点前的同一时刻起算、
    // 同样重叠、同样被跳过——排程在第一个锚点处整体停摆，锚点之后的几个小时全空，
    // 再被 fillGaps 填成一整块数百分钟的"休息补给"。
    // 最多顺延 blocked.length 次即可跨过所有锚点，不会无限循环。
    for (let attempt = 0; attempt <= blocked.length; attempt++) {
      const hit = blocked.find((b) => arrAt < b.end && itemEnd > b.start);
      if (!hit) break;
      currentMin = hit.end;
      currentArea = hit.area ?? currentArea;
      wk = walkTime(currentArea, item.area, profile);
      arrAt = currentMin + wk;
      itemEnd = arrAt + item.wait + item.duration;
    }

    // 顺延后仍与锚点重叠（项目太长，跨越了下一个锚点）：只跳过这个项目
    if (blocked.some((b) => arrAt < b.end && itemEnd > b.start)) continue;

    // 超出离园时间：后续候选只会更晚，直接结束
    if (itemEnd > depMin) break;

    // Multi Pass 90 分钟间隔（严格 >= 90）；无限次套餐不适用
    if (!llUnlimited && item.llType === "package" && (arrAt - lastLLMin) < 90) continue;

    if (wk > 0) result.push({
      time: minToTime(currentMin), endTime: minToTime(arrAt),
      itemId: "walk", itemName: `步行至${item.area}`,
      area: item.area, estimatedWait: 0, walkMinutes: wk, duration: wk,
      note: `步行约${wk}分钟`, type: "walk",
    });

    result.push({
      time: minToTime(arrAt), endTime: minToTime(itemEnd),
      itemId: item.id, itemName: item.name, area: item.area,
      estimatedWait: item.wait, walkMinutes: wk, duration: item.duration,
      note: item.note, type: item.type,
      llType: item.llType, singleRiderTip: item.singleRider,
    });

    if (!llUnlimited && item.llType === "package") lastLLMin = arrAt;
    currentArea = item.area;
    currentMin  = itemEnd;
    usedItems.add(item.id);
    itemsAdded++;
  }

  return result.sort((a, b) => a.time.localeCompare(b.time));
}

// ─── 空档填满 ─────────────────────────────────────────────────────────────────
/** 单个休息块的时长上限（分钟）。 */
const MAX_REST_MINUTES = 45;

export function fillGaps(
  itinerary: ItineraryItem[],
  profile: UserProfile,
): ItineraryItem[] {
  const result = [...itinerary];
  const depMin = timeToMin(profile.departureTime);
  const photoSpots = getPhotoSpots(profile.park);
  const shopSpots  = getShopSpots(profile.park);
  const usedIds    = new Set(result.map((i) => i.itemId));

  let i = 0;
  while (i < result.length - 1) {
    const current = result[i];
    const next    = result[i + 1];
    const gapStart = timeToMin(current.endTime);
    const gapEnd   = timeToMin(next.time);
    const gapMin   = gapEnd - gapStart;

    if (gapMin >= 20 && next.isAnchor) {
      const inserts: ItineraryItem[] = [];
      let cursor = gapStart;

      if (profile.focusPhoto && gapMin >= 25) {
        const spot = photoSpots
          .filter((s) => !usedIds.has(s.id))
          .find((s) => s.area === current.area || s.area === next.area);
        if (spot && cursor + spot.duration <= gapEnd - 5) {
          inserts.push({
            time: minToTime(cursor), endTime: minToTime(cursor + spot.duration),
            itemId: spot.id, itemName: spot.name,
            area: spot.areaName, estimatedWait: 0, walkMinutes: 0,
            duration: spot.duration, note: spot.tips,
            type: "photo",
            photoTips: `小红书搜索「${spot.xhsKeyword}」查看更多机位`,
          });
          cursor += spot.duration;
          usedIds.add(spot.id);
        }
      }

      if (profile.focusShopping && cursor + 15 <= gapEnd - 5) {
        const shop = shopSpots
          .filter((s) => !usedIds.has(s.id))
          .find((s) => s.area === current.area || s.area === next.area);
        if (shop) {
          const dur = Math.min(shop.duration, gapEnd - cursor - 5);
          inserts.push({
            time: minToTime(cursor), endTime: minToTime(cursor + dur),
            itemId: shop.id, itemName: shop.name,
            area: shop.areaName, estimatedWait: 0, walkMinutes: 0,
            duration: dur, note: shop.tips, type: "shop",
            shopTips: shop.hasLimitedEdition ? "⭐ 有限定款" : undefined,
          });
          cursor += dur;
          usedIds.add(shop.id);
        }
      }

      const remainGap = gapEnd - cursor;
      if (remainGap >= 15 && inserts.length === 0) {
        // 休息块封顶 45 分钟：真到了几小时的空档，那是排程出了问题，
        // 用一个"4 小时休息补给"盖住只会把问题藏起来，如实标成自由活动。
        const restDuration = Math.min(remainGap, MAX_REST_MINUTES);
        const isOversized = remainGap > MAX_REST_MINUTES;
        inserts.push({
          time: minToTime(cursor), endTime: minToTime(cursor + restDuration),
          itemId: "rest", itemName: isOversized ? "🚶 自由活动" : "☕ 休息补给",
          area: current.area, estimatedWait: 0, walkMinutes: 0,
          duration: restDuration,
          note: isOversized
            ? `这段有 ${Math.round(remainGap / 60 * 10) / 10} 小时空档，可自由安排或让 AI 助手重新规划。`
            : "补充水分和体力，可在附近小吃摊买零食。",
          type: "rest",
        });
      }

      if (inserts.length > 0) {
        result.splice(i + 1, 0, ...inserts);
        i += inserts.length;
      }
    }
    i++;
  }

  return result;
}

/**
 * 手动调整顺序后重算时间轴。
 *
 * 用户长按拖动或删除条目时，前端此前只交换数组位置、不动 time/endTime，于是
 * 一个 22:00 的项目被挪到 11:00 的项目前面后，列表就显示成"晚上10点的下一项是
 * 上午11点"。这里按新顺序把开始时间重新串一遍。
 *
 * 每个条目保留它原本占用的时长（endTime - time，对游乐项目而言已包含排队时间），
 * 只平移起始时刻。巡游、烟花这类锚点是外部固定场次，时间不可移动，游标直接跳到
 * 锚点结束。
 */
export function resequenceItinerary(items: ItineraryItem[]): ItineraryItem[] {
  if (!items.length) return items;

  // 起点取整个行程的最早开始时刻，而不是 items[0].time——交换之后首位带的是
  // 它原来的（可能很晚的）时间戳，用它当起点会把整个行程平移到深夜。
  let cursor = Math.min(...items.map((i) => timeToMin(i.time)));

  return items.map((item) => {
    if (item.isAnchor) {
      cursor = Math.max(cursor, timeToMin(item.endTime));
      return item;
    }
    const length = Math.max(0, timeToMin(item.endTime) - timeToMin(item.time));
    const next = { ...item, time: minToTime(cursor), endTime: minToTime(cursor + length) };
    cursor += length;
    return next;
  });
}

// ─── 主路由入口 ───────────────────────────────────────────────────────────────
export function buildRoute(params: {
  rides: Ride[];
  scores: RideScore[];
  historical: HistoricalWaitData[];
  live: LiveWaitData[];
  profile: UserProfile;
  startArea: string;
  parkHours: ParkHours;
  anchors: ItineraryItem[];
}): ItineraryItem[] {
  const { rides, scores, historical, live, profile, startArea, parkHours, anchors } = params;

  const openMin  = timeToMin(parkHours.open);
  const depMin   = timeToMin(profile.departureTime);
  const startMin = Math.max(timeToMin(profile.arrivalTime), openMin);

  // 边缘情况：离园时间 <= 入园时间
  if (depMin <= startMin) {
    console.warn("[routing] 离园时间早于或等于入园时间，返回空行程");
    return [...anchors].sort((a, b) => a.time.localeCompare(b.time));
  }

  const photoSpots = getPhotoSpots(profile.park);
  const shopSpots  = getShopSpots(profile.park);

  // 按模式筛选候选池
  let ridesPool = rides;
  if (profile.mode === "thrill") {
    // 刺激项目优先，但排完之后继续用其余项目填满剩下的时间。
    // 此前是把非刺激项目直接排除在候选池外：园区符合条件的刺激项目只有个位数，
    // 排完就没东西可排了，一整天的行程断在中午——实测覆盖率只有 15%–36%。
    const thrillRides = rides.filter((r) => r.thrillScore >= 3);
    const others = rides.filter((r) => r.thrillScore < 3);
    ridesPool = thrillRides.length > 0 ? [...thrillRides, ...others] : rides;
  }
  if (profile.mode === "family") {
    const familyRides = rides.filter((r) => !isHeightBlocked(r, profile));
    // 边缘情况：family模式孩子太小导致候选池为空 → 放宽到 kidsScore >= 3
    if (familyRides.length === 0) {
      ridesPool = rides.filter((r) => r.kidsScore >= 3);
    } else {
      ridesPool = familyRides;
    }
  }

  // 三层候选池：must-do → worth-it → if-time
  const mustDo  = buildCandidates(ridesPool, scores, historical, live, profile, startArea, startMin, openMin, (s) => s.priority === "must-do");
  const worthIt = buildCandidates(ridesPool, scores, historical, live, profile, startArea, startMin, openMin, (s) => s.priority === "worth-it");
  const ifTime  = buildCandidates(ridesPool, scores, historical, live, profile, startArea, startMin, openMin, (s) => s.priority === "if-time");

  let allCandidates = [...mustDo, ...worthIt, ...ifTime];

  // photo + shopping 模式插入 POI
  if (profile.focusPhoto) {
    const photoItems: CandidateItem[] = photoSpots.map((s) => ({
      id: s.id, name: s.name, area: s.area, type: "photo" as const,
      wait: 0, duration: s.duration,
      note: s.tips, llType: null, singleRider: false,
      costVal: 0,
    }));
    const interleaved: CandidateItem[] = [];
    const maxLen = Math.max(allCandidates.length, photoItems.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < allCandidates.length) interleaved.push(allCandidates[i]);
      if (i < photoItems.length)    interleaved.push(photoItems[i]);
    }
    allCandidates = interleaved;
  }

  if (profile.focusShopping) {
    const shopItems: CandidateItem[] = shopSpots
      .sort((a, b) => a.bestTimeToVisit === "opening" ? -1 : 1)
      .map((s) => ({
        id: s.id, name: s.name, area: s.area, type: "shop" as const,
        wait: 0, duration: s.duration,
        note: s.tips, llType: null, singleRider: false,
        costVal: 0,
      }));
    const interleaved: CandidateItem[] = [];
    const maxLen = Math.max(allCandidates.length, shopItems.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < allCandidates.length) interleaved.push(allCandidates[i]);
      if (i < shopItems.length)     interleaved.push(shopItems[i]);
    }
    allCandidates = interleaved;
  }

  const raw = buildTimeline(allCandidates, anchors, profile, startArea, parkHours);
  return fillGaps(raw, profile);
}
