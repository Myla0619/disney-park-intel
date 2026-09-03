/**
 * 用餐时段
 *
 * 此前用餐时间是写死的（11:30 午餐 / 15:30 小食 / 19:00 晚餐），用户完全无从干预。
 * 而皇家宴会厅、卢米亚厨房这类餐厅需要提前预约——订了 12:30 却按 11:30 排，
 * 等于这个预约白订了。
 *
 * 现在区分两种情况：
 *   已预约   园方给定的固定时段，与巡游烟花同级，行程必须让路
 *   打算吃   用户偏好的时间，排程可在附近浮动
 */

import { DiningPlan, Restaurant, UserProfile } from "@/types";
import { timeToMin, minToTime } from "./routing-time";

/** 各餐的用餐高峰，推荐时间会主动避开。 */
const PEAK_WINDOWS: Record<string, { start: number; end: number }> = {
  lunch: { start: timeToMin("12:00"), end: timeToMin("13:30") },
  dinner: { start: timeToMin("18:00"), end: timeToMin("19:30") },
};

/** 各餐的理想时间（已避开高峰）。 */
const IDEAL_TIME: Record<string, number> = {
  breakfast: timeToMin("09:00"),
  lunch: timeToMin("11:30"),
  snack: timeToMin("15:30"),
  dinner: timeToMin("17:30"),
};

export function mealDuration(profile: Pick<UserProfile, "diningPreference">, mealType: string): number {
  if (mealType === "snack") return 15;
  return profile.diningPreference === "quick" ? 20 : profile.diningPreference === "fancy" ? 60 : 45;
}

/**
 * 给出推荐用餐时间。
 *
 * 取该餐的理想时间，夹到用户的入园/离园区间内；若用户要看烟花且晚餐会与之冲突，
 * 把晚餐提前，避免"吃到一半赶去占位"。
 */
export function recommendedMealTime(
  mealType: DiningPlan["mealType"],
  profile: UserProfile
): string {
  const arrive = timeToMin(profile.arrivalTime);
  const depart = timeToMin(profile.departureTime);
  const duration = mealDuration(profile, mealType);

  let t = IDEAL_TIME[mealType] ?? IDEAL_TIME.lunch;

  // 晚餐与烟花占位冲突时提前，宁可早吃也不要吃一半跑掉
  if (mealType === "dinner" && profile.watchFireworks && profile.fireworksTime) {
    const fireworks = timeToMin(profile.fireworksTime);
    const prepStart = fireworks - 30;
    if (t + duration > prepStart) t = Math.max(arrive + 30, prepStart - duration - 15);
  }

  // 夹进可用区间
  t = Math.max(t, arrive + 30);
  t = Math.min(t, depart - duration - 10);

  return minToTime(Math.max(0, t));
}

/** 该时间是否落在用餐高峰内，用于在界面上提示用户。 */
export function isPeakTime(mealType: string, time: string): boolean {
  const w = PEAK_WINDOWS[mealType];
  if (!w) return false;
  const t = timeToMin(time);
  return t >= w.start && t <= w.end;
}

/** 依据餐厅支持的餐段，推断它最适合安排在哪一餐。 */
export function inferMealType(restaurant: Restaurant): DiningPlan["mealType"] {
  const order: DiningPlan["mealType"][] = ["lunch", "dinner", "snack", "breakfast"];
  for (const m of order) {
    if ((restaurant.bestMealTime as string[]).includes(m)) return m;
  }
  return "lunch";
}

/** 同一餐只保留一条计划，并按时间排序，便于排程按序处理。 */
export function normalizeDiningPlans(plans: DiningPlan[]): DiningPlan[] {
  const byMeal = new Map<string, DiningPlan>();
  for (const p of plans) {
    // 后出现的覆盖先出现的；预约优先于"打算吃"
    const prev = byMeal.get(p.mealType);
    if (!prev || p.isReservation || !prev.isReservation) byMeal.set(p.mealType, p);
  }
  return [...byMeal.values()].sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
}
