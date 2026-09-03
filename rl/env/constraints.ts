/**
 * 行程硬约束校验器（TS 版）
 *
 * 与 scripts/eval_itinerary.py 的检查项对齐。三处共用：
 *  1. check_constraints 工具——模型可以调它自查行程（学会自我修正）
 *  2. RL reward 的"硬约束校验"维度（rule-based 可验证奖励）
 *  3. 数据清洗时过滤蒸馏轨迹
 */

import type { ItineraryItem, UserProfile } from "@/types";
import { timeToMin } from "@/lib/routing";
import { getRideById } from "@/lib/parks-data";

export type ConstraintCheck = {
  check: string;
  pass: boolean;
  detail: string;
};

const TIME_TOLERANCE_MIN = 2;
const DEPARTURE_TOLERANCE_MIN = 5;
const LL_INTERVAL_MIN = 90;

export function checkItinerary(
  items: ItineraryItem[],
  profile: UserProfile
): { passed: boolean; checks: ConstraintCheck[] } {
  const checks: ConstraintCheck[] = [];
  const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!Array.isArray(items) || !items.length || !timePattern.test(profile.arrivalTime) || !timePattern.test(profile.departureTime) ||
      profile.departureTime < profile.arrivalTime || items.some(i => !i || !timePattern.test(i.time) || !timePattern.test(i.endTime) || i.endTime < i.time) ||
      !Array.isArray(profile.kids) || profile.kids.some(k => !k || !Number.isFinite(k.heightCm) || k.heightCm <= 0)) {
    return { passed: false, checks: [{ check: "input_validity", pass: false, detail: "空行程、非法时间/负时长或孩子身高数据无效" }] };
  }
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));

  // 1. 时间连续性：任何项不得早于上一项结束（容差 2 分钟）
  let contOk = true;
  let contDetail = "所有时间衔接正常";
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = timeToMin(sorted[i - 1].endTime);
    const curStart = timeToMin(sorted[i].time);
    if (curStart < prevEnd - TIME_TOLERANCE_MIN) {
      contOk = false;
      contDetail = `「${sorted[i].itemName}」${sorted[i].time} 开始，早于上一项「${sorted[i - 1].itemName}」结束时间 ${sorted[i - 1].endTime}`;
      break;
    }
  }
  checks.push({ check: "time_continuity", pass: contOk, detail: contDetail });

  // 2. 身高合规：所有孩子必须满足项目身高要求（边界为 >=）
  const kids = profile.kids ?? [];
  let heightOk = true;
  let heightDetail = "无身高违规";
  if (kids.length) {
    const minH = Math.min(...kids.map((k) => k.heightCm));
    for (const item of sorted) {
      if (item.type !== "ride") continue;
      const ride = getRideById(item.itemId);
      if (ride?.heightRequirement && minH < ride.heightRequirement) {
        heightOk = false;
        heightDetail = `「${item.itemName}」要求 ${ride.heightRequirement}cm，孩子最矮 ${minH}cm`;
        break;
      }
    }
  }
  checks.push({ check: "height_compliance", pass: heightOk, detail: heightDetail });

  // 3. 离园时间：任何项不得晚于离园时间结束（容差 5 分钟）
  const depMin = timeToMin(profile.departureTime);
  const overdue = sorted.find((i) => timeToMin(i.endTime) > depMin + DEPARTURE_TOLERANCE_MIN);
  checks.push({
    check: "departure",
    pass: !overdue,
    detail: overdue
      ? `「${overdue.itemName}」结束于 ${overdue.endTime}，晚于离园时间 ${profile.departureTime}`
      : "均在离园时间内",
  });

  // 4. 优速通间隔：套餐类 LL 项目间隔 >= 90 分钟
  const llItems = sorted.filter((i) => i.llType === "package");
  let llOk = true;
  let llDetail = llItems.length ? "套餐项目间隔合规" : "无套餐 LL 项目";
  for (let i = 1; i < llItems.length; i++) {
    const gap = timeToMin(llItems[i].time) - timeToMin(llItems[i - 1].time);
    if (gap < LL_INTERVAL_MIN) {
      llOk = false;
      llDetail = `「${llItems[i - 1].itemName}」与「${llItems[i].itemName}」间隔仅 ${gap} 分钟（要求 ≥${LL_INTERVAL_MIN}）`;
      break;
    }
  }
  checks.push({ check: "ll_interval", pass: llOk, detail: llDetail });

  // 5. 入园时间：任何项不得早于入园时间开始
  const arrMin = timeToMin(profile.arrivalTime);
  const early = sorted.find((i) => timeToMin(i.time) < arrMin - TIME_TOLERANCE_MIN);
  checks.push({
    check: "arrival",
    pass: !early,
    detail: early
      ? `「${early.itemName}」开始于 ${early.time}，早于入园时间 ${profile.arrivalTime}`
      : "均在入园时间后",
  });

  return { passed: checks.every((c) => c.pass), checks };
}
