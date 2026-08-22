/**
 * 基于历史快照的等待时间预测
 *
 * 数据来自 scripts/collect_wait_snapshots.mjs 定时采集的 Queue-Times 快照
 * （data/wait-snapshots/YYYY-MM.jsonl，每行一条 {ts, rideId, wait}）。
 *
 * 预测值 = 近7日同时段均值 × 0.5
 *        + 近4周同星期同时段均值 × 0.3
 *        + 全量同时段基线 × 0.2
 *        再乘节假日/周末系数。
 *
 * 三项各自缺失时权重会重新归一化——不能因为缺一项就把预测拉向 0。历史样本不足
 * 时返回 null，由调用方回退到当前快照外推（见 wait-times.ts）。
 */

import { HistoricalWaitData } from "@/types";
import { dateFactor } from "./wait-times";

export type Snapshot = {
  /** ISO 8601，采集时刻 */
  ts: string;
  rideId: string;
  /** 分钟；null 表示当时未开放 */
  wait: number | null;
};

/** 低于这个样本量不做历史预测，避免用两三个点冒充"历史模型"。 */
export const MIN_SAMPLES = 8;

const WEIGHTS = { recent7d: 0.5, sameWeekday4w: 0.3, baseline: 0.2 };

/** 同时段：±90 分钟，兼顾样本量与时段区分度。 */
const TIME_WINDOW_MIN = 90;

function minutesOfDay(ts: string): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/**
 * 对单个项目做加权预测。
 * @param targetDate 目标日期 YYYY-MM-DD
 * @param targetMinute 目标时刻（当天分钟数），默认取中午
 * @param now 参照"现在"的时间，注入以便测试
 */
export function predictWait(
  snapshots: Snapshot[],
  targetDate: string,
  targetMinute = 12 * 60,
  now: Date = new Date()
): { predictedWait: number; confidence: HistoricalWaitData["confidence"]; basis: string } | null {
  const usable = snapshots.filter((s) => s.wait != null && s.wait >= 0);
  if (usable.length < MIN_SAMPLES) return null;

  const inTimeWindow = usable.filter(
    (s) => Math.abs(minutesOfDay(s.ts) - targetMinute) <= TIME_WINDOW_MIN
  );
  // 同时段样本太少时放宽到全天，宁可时段区分度差，也好过没有预测
  const pool = inTimeWindow.length >= MIN_SAMPLES ? inTimeWindow : usable;
  const windowLabel = inTimeWindow.length >= MIN_SAMPLES ? "同时段" : "全天";

  const targetWeekday = new Date(targetDate).getDay();

  const recent7d = mean(
    pool.filter((s) => daysBetween(new Date(s.ts), now) <= 7).map((s) => s.wait!)
  );
  const sameWeekday4w = mean(
    pool
      .filter((s) => {
        const d = new Date(s.ts);
        return d.getDay() === targetWeekday && daysBetween(d, now) <= 28;
      })
      .map((s) => s.wait!)
  );
  const baseline = mean(pool.map((s) => s.wait!));

  const parts: { value: number; weight: number; label: string }[] = [];
  if (recent7d != null) parts.push({ value: recent7d, weight: WEIGHTS.recent7d, label: "近7日" });
  if (sameWeekday4w != null)
    parts.push({ value: sameWeekday4w, weight: WEIGHTS.sameWeekday4w, label: "近4周同星期" });
  if (baseline != null) parts.push({ value: baseline, weight: WEIGHTS.baseline, label: "历史基线" });
  if (!parts.length) return null;

  // 缺项时按剩余项重新归一化，否则缺一项就等于把预测按比例调低
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const weighted = parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;

  const factor = dateFactor(targetDate);
  const predictedWait = Math.max(0, Math.round(weighted * factor.value));

  // 置信度由样本量与成分完整度共同决定，不是拍脑袋的常量
  const confidence: HistoricalWaitData["confidence"] =
    pool.length >= 60 && parts.length === 3 ? "high" : pool.length >= 20 ? "medium" : "low";

  return {
    predictedWait,
    confidence,
    basis: `${windowLabel}${parts.map((p) => p.label).join("+")}加权（${pool.length}个样本）${factor.label}`,
  };
}

/** 对整批快照按项目分组后逐个预测；样本不足的项目不出现在结果里。 */
export function predictAll(
  snapshots: Snapshot[],
  targetDate: string,
  targetMinute?: number,
  now?: Date
): HistoricalWaitData[] {
  const byRide = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const list = byRide.get(s.rideId);
    if (list) list.push(s);
    else byRide.set(s.rideId, [s]);
  }

  const out: HistoricalWaitData[] = [];
  for (const [rideId, rideSnapshots] of byRide) {
    const p = predictWait(rideSnapshots, targetDate, targetMinute, now);
    if (p) out.push({ rideId, ...p });
  }
  return out;
}
