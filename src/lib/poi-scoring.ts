/**
 * 拍照点与商店的评分
 *
 * 此前这两类地点根本没有评分：`costVal: 0`，按数组顺序与游乐项目机械交替插入。
 * 后果是数据里已有的时段信息完全失效——城堡机位写着最佳时段是"烟花后
 * 21:00-21:20"，却可能被排在上午九点；旗舰店写着"开园时货最全"，却可能排到闭园前。
 *
 * 这里给出与游乐项目同构的成本值（越小越优先），由三个维度合成：
 *   时段匹配  —— 排到的时刻是否落在该地点的最佳时段内
 *   档案匹配  —— 与游玩模式、同行人员是否契合
 *   固有价值  —— 地标必拍程度 / 店面规模与限定款
 */

import { PhotoSpot, ShopSpot, UserProfile } from "@/types";
import { timeToMin } from "./routing-time";

export type PoiScore = {
  /** 成本值，越小越优先，与游乐项目的 costVal 同量纲 */
  costVal: number;
  /** 0-100，用于界面展示与调试 */
  score: number;
  reasons: string[];
};

/** 解析 "09:00-09:30" 或 "烟花后21:00-21:20" 这类时段串。 */
export function parseTimeSlot(slot: string): { start: number; end: number } | null {
  const m = slot.match(/(\d{1,2}:\d{2})\s*[-—~]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const start = timeToMin(m[1]);
  const end = timeToMin(m[2]);
  return end > start ? { start, end } : null;
}

/**
 * 时段匹配度 0-1。
 * 落在最佳时段内得 1；否则按与最近时段的距离衰减，两小时以外归零。
 * 没有标注最佳时段的地点返回 0.5——不加分也不惩罚。
 */
export function timeSlotFit(slots: string[], atMin: number): number {
  const parsed = slots.map(parseTimeSlot).filter((s): s is { start: number; end: number } => !!s);
  if (!parsed.length) return 0.5;

  let best = 0;
  for (const { start, end } of parsed) {
    if (atMin >= start && atMin <= end) return 1;
    const gap = atMin < start ? start - atMin : atMin - end;
    best = Math.max(best, Math.max(0, 1 - gap / 120));
  }
  return best;
}

/** 商店的时段匹配：旗舰店开园时货最全，闭园前时段适合最后采买。 */
export function shopTimeFit(
  bestTime: ShopSpot["bestTimeToVisit"],
  atMin: number,
  openMin: number,
  closeMin: number
): number {
  if (bestTime === "opening") {
    const gap = Math.max(0, atMin - openMin);
    return Math.max(0.2, 1 - gap / 180); // 开园后三小时内递减
  }
  if (bestTime === "before-closing") {
    const gap = Math.max(0, closeMin - atMin);
    return Math.max(0.2, 1 - gap / 180);
  }
  return 0.7;
}

/** 拍照点与档案的契合度 0-1。 */
export function photoProfileFit(spot: PhotoSpot, profile: UserProfile): number {
  let fit = 0.5;
  const hasKids = (profile.kids ?? []).length > 0;

  if (profile.mode === "photo" || profile.focusPhoto) fit += 0.2;
  if (spot.photoType === "landmark") fit += 0.2;
  // 互动型机位对带娃家庭价值更高，纯风景型则相反
  if (hasKids && spot.photoType === "interactive") fit += 0.2;
  if (hasKids && spot.photoType === "scenic") fit -= 0.1;
  // 行动不便时，需要走到偏远机位的性价比下降
  if (profile.mobilityNeeds && spot.walkFromNearestRide > 5) fit -= 0.2;

  return Math.min(1, Math.max(0, fit));
}

/** 商店与档案的契合度 0-1。 */
export function shopProfileFit(shop: ShopSpot, profile: UserProfile): number {
  let fit = 0.4;
  const hasKids = (profile.kids ?? []).length > 0;

  if (profile.mode === "shopping" || profile.focusShopping) fit += 0.2;
  if (shop.scale === "flagship") fit += 0.25;
  else if (shop.scale === "major") fit += 0.15;
  else if (shop.scale === "kiosk") fit -= 0.15;

  if (shop.hasLimitedEdition) fit += 0.1;
  // 带娃时玩具与角色扮演服更相关
  if (hasKids && shop.categories.some((c) => c === "玩具" || c === "礼服/角色扮演服")) fit += 0.15;
  // 小货车品类少，带着孩子专门绕过去不划算
  if (hasKids && shop.scale === "kiosk") fit -= 0.1;

  return Math.min(1, Math.max(0, fit));
}

/** 把 0-1 的契合度转成与游乐项目同量纲的成本值。 */
function toCost(score01: number): number {
  // 游乐项目的 costVal 大致在 5–60，这里映射到同一区间，满分对应最低成本
  return Math.round((1 - score01) * 55 + 5);
}

export function scorePhotoSpot(
  spot: PhotoSpot,
  profile: UserProfile,
  atMin: number
): PoiScore {
  const time = timeSlotFit(spot.bestTimeSlots, atMin);
  const prof = photoProfileFit(spot, profile);
  const landmark = spot.photoType === "landmark" ? 1 : 0.6;

  const combined = time * 0.45 + prof * 0.35 + landmark * 0.2;
  const reasons: string[] = [];
  if (time >= 0.99) reasons.push("正处最佳拍摄时段");
  else if (time < 0.3) reasons.push("与最佳拍摄时段相差较远");
  if (spot.photoType === "landmark") reasons.push("地标必拍");

  return { costVal: toCost(combined), score: Math.round(combined * 100), reasons };
}

export function scoreShop(
  shop: ShopSpot,
  profile: UserProfile,
  atMin: number,
  openMin: number,
  closeMin: number
): PoiScore {
  const time = shopTimeFit(shop.bestTimeToVisit, atMin, openMin, closeMin);
  const prof = shopProfileFit(shop, profile);
  const scale = { flagship: 1, major: 0.75, small: 0.5, kiosk: 0.25 }[shop.scale];

  const combined = time * 0.35 + prof * 0.4 + scale * 0.25;
  const reasons: string[] = [];
  if (shop.scale === "flagship") reasons.push("全园旗舰店");
  if (shop.hasLimitedEdition) reasons.push("有限定款线");
  if (shop.bestTimeToVisit === "opening" && time > 0.8) reasons.push("开园时段货品最全");

  return { costVal: toCost(combined), score: Math.round(combined * 100), reasons };
}
