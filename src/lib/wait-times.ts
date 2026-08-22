/**
 * 等待时间数据服务
 *
 * 路由层（/api/waittimes）与 Agent 工具层共用同一份实现：Agent 直接调用这里的
 * 函数，而不是回头 fetch 自己的 HTTP 接口——后者在 Serverless 上依赖
 * NEXT_PUBLIC_BASE_URL，未配置时会打到 localhost 而整条工具链失败。
 */

import { getParkById } from "./parks-data";
import { rideIdFromThemeparks, rideIdFromQueueTimes } from "./provider-ids";
import { predictAll } from "./wait-prediction";
import { loadSnapshots } from "./snapshot-store";
import { LiveWaitData, HistoricalWaitData } from "@/types";

const THEMEPARKS_BASE = "https://api.themeparks.wiki/v1";
const QUEUE_TIMES_BASE = "https://queue-times.com/parks";

const LIVE_TTL_MS = 2 * 60 * 1000;
const PREDICTED_TTL_MS = 30 * 60 * 1000;

export type WaitTimesResult<T> = {
  data: T[];
  /** 命中进程内缓存 */
  cached: boolean;
  /** 数据源不可用，返回的是降级默认值 */
  fallback: boolean;
  source: string;
  error?: string;
  /** 数据源返回但 provider-ids 未收录的实体数，持续 > 0 说明映射表需要更新 */
  unmappedEntities?: number;
};

type CacheEntry<T> = { data: T; ts: number };

// 缓存 key 必须包含园区（预测模式还要含日期），否则多园区请求互相串数据。
const liveCache = new Map<string, CacheEntry<LiveWaitData[]>>();
const predictedCache = new Map<string, CacheEntry<HistoricalWaitData[]>>();

/** 记录上一次预测数据的来源，供缓存命中时如实回报。 */
let predictedSource = "queue-times.com";

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

/** 仅供测试使用：清空进程内缓存。 */
export function __clearWaitTimeCaches() {
  liveCache.clear();
  predictedCache.clear();
}

// ─── 实时等待时间（themeparks.wiki）────────────────────────────────────────
export async function getLiveWaitTimes(parkId: string): Promise<WaitTimesResult<LiveWaitData>> {
  const park = getParkById(parkId);
  if (!park) throw new Error(`未知园区: ${parkId}`);

  const cached = readCache(liveCache, parkId, LIVE_TTL_MS);
  if (cached) return { data: cached, cached: true, fallback: false, source: "themeparks.wiki" };

  try {
    const res = await fetch(`${THEMEPARKS_BASE}/entity/${park.theparksApiId}/live`, {
      next: { revalidate: LIVE_TTL_MS / 1000 },
    });
    if (!res.ok) throw new Error(`themeparks.wiki responded ${res.status}`);
    const json = await res.json();

    const data = mapLivePayload(parkId, json);
    liveCache.set(parkId, { data: data.data, ts: Date.now() });
    return { ...data, cached: false, fallback: false, source: "themeparks.wiki" };
  } catch (err: any) {
    return {
      data: fallbackLiveWaits(),
      cached: false,
      fallback: true,
      source: "fallback",
      error: err.message,
    };
  }
}

/** 把 themeparks.wiki 的响应体映射为内部结构。导出以便单测直接喂样例响应。 */
export function mapLivePayload(
  parkId: string,
  json: any
): { data: LiveWaitData[]; unmappedEntities: number } {
  let unmappedEntities = 0;
  const data: LiveWaitData[] = [];

  for (const item of json?.liveData ?? []) {
    if (item.entityType !== "ATTRACTION") continue;
    // 接口返回的是 entity UUID，必须映射回内部 slug，否则下游 join 全部落空。
    const rideId = rideIdFromThemeparks(parkId, item.id);
    if (!rideId) {
      unmappedEntities++;
      continue;
    }
    data.push({
      rideId,
      waitMinutes: item.queue?.STANDBY?.waitTime ?? null,
      status: normalizeStatus(item.status),
      lastUpdated: item.lastUpdated ?? new Date().toISOString(),
    });
  }

  return { data, unmappedEntities };
}

// ─── 预测等待时间 ─────────────────────────────────────────────────────────
export async function getPredictedWaitTimes(
  parkId: string,
  visitDate: string
): Promise<WaitTimesResult<HistoricalWaitData>> {
  const park = getParkById(parkId);
  if (!park) throw new Error(`未知园区: ${parkId}`);
  if (!park.queueTimesId) {
    return { data: fallbackPredictedWaits(), cached: false, fallback: true, source: "fallback" };
  }

  const cacheKey = `${parkId}:${visitDate}`;
  const cached = readCache(predictedCache, cacheKey, PREDICTED_TTL_MS);
  if (cached) return { data: cached, cached: true, fallback: false, source: predictedSource };

  // 首选真实历史加权模型；采集数据不足时才退回当前快照外推
  const fromHistory = predictAll(loadSnapshots(), visitDate);
  if (fromHistory.length) {
    predictedCache.set(cacheKey, { data: fromHistory, ts: Date.now() });
    predictedSource = "historical-model";
    return { data: fromHistory, cached: false, fallback: false, source: "historical-model" };
  }

  try {
    const res = await fetch(`${QUEUE_TIMES_BASE}/${park.queueTimesId}/queue_times.json`);
    if (!res.ok) throw new Error(`Queue-Times responded ${res.status}`);
    const json = await res.json();

    const data = mapQueueTimesPayload(parkId, json, visitDate);
    predictedCache.set(cacheKey, { data, ts: Date.now() });
    predictedSource = "queue-times.com";
    return { data, cached: false, fallback: false, source: "queue-times.com" };
  } catch (err: any) {
    return {
      data: fallbackPredictedWaits(),
      cached: false,
      fallback: true,
      source: "fallback",
      error: err.message,
    };
  }
}

/**
 * 把 Queue-Times 的当前排队快照按日期系数外推。
 *
 * 这是启发式基线，不是历史回归——它只看得到"此刻"的排队。真正基于历史快照的
 * 加权模型见 src/lib/wait-prediction.ts，那条路径在有采集数据时优先生效。
 */
export function mapQueueTimesPayload(
  parkId: string,
  json: any,
  visitDate: string
): HistoricalWaitData[] {
  const factor = dateFactor(visitDate);
  const allRides = [
    ...(json?.lands ?? []).flatMap((l: any) => l.rides ?? []),
    ...(json?.rides ?? []),
  ];

  const predicted: HistoricalWaitData[] = [];
  for (const ride of allRides) {
    const rideId = rideIdFromQueueTimes(parkId, ride.id);
    if (!rideId) continue;
    predicted.push({
      rideId,
      predictedWait: Math.round((ride.wait_time ?? 30) * factor.value),
      confidence: "low",
      basis: `当前排队快照${factor.label}`,
    });
  }
  return predicted;
}

export function dateFactor(visitDate: string): { value: number; label: string } {
  const dayOfWeek = new Date(visitDate).getDay();
  if (isChineseHoliday(visitDate)) return { value: 1.4, label: "，节假日系数 ×1.4" };
  if (dayOfWeek === 0 || dayOfWeek === 6) return { value: 1.2, label: "，周末系数 ×1.2" };
  return { value: 1.0, label: "" };
}

/** 中国法定节假日（主要节日，按公历日期）。 */
export function isChineseHoliday(dateStr: string): boolean {
  const holidays = [
    "01-01",
    "05-01", "05-02", "05-03",
    "10-01", "10-02", "10-03", "10-04", "10-05", "10-06", "10-07",
  ];
  return holidays.includes(dateStr.slice(5, 10));
}

function normalizeStatus(s: string): LiveWaitData["status"] {
  const map: Record<string, LiveWaitData["status"]> = {
    OPERATING: "operating",
    DOWN: "down",
    CLOSED: "closed",
    REFURBISHMENT: "refurbishment",
  };
  return map[s] ?? "operating";
}

// ─── 数据源不可用时的降级值（rideId 必须是内部 slug）───────────────────────
function fallbackLiveWaits(): LiveWaitData[] {
  const now = new Date().toISOString();
  const waits: Record<string, number | null> = {
    tron: 85, "roaring-rapids": 40, "seven-dwarfs": 55, soaring: 60,
    pirates: 25, "peter-pan": 45, "buzz-lightyear": 20, "stunt-show": null,
  };
  return Object.entries(waits).map(([rideId, waitMinutes]) => ({
    rideId, waitMinutes, status: "operating" as const, lastUpdated: now,
  }));
}

function fallbackPredictedWaits(): HistoricalWaitData[] {
  const waits: Record<string, number> = {
    tron: 75, soaring: 55, "seven-dwarfs": 45, pirates: 20,
    "peter-pan": 35, "roaring-rapids": 30, "buzz-lightyear": 15,
  };
  return Object.entries(waits).map(([rideId, predictedWait]) => ({
    rideId, predictedWait, confidence: "low" as const, basis: "降级默认值",
  }));
}
