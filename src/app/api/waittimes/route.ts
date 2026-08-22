import { NextRequest, NextResponse } from "next/server";
import { getParkById } from "@/lib/parks-data";
import { rideIdFromThemeparks, rideIdFromQueueTimes } from "@/lib/provider-ids";
import { LiveWaitData, HistoricalWaitData } from "@/types";

const THEMEPARKS_BASE = "https://api.themeparks.wiki/v1";
const QUEUE_TIMES_BASE = "https://queue-times.com/parks";

const LIVE_TTL_MS = 2 * 60 * 1000;
const HIST_TTL_MS = 30 * 60 * 1000;

type CacheEntry<T> = { data: T; ts: number };

// 缓存 key 必须包含园区（和历史模式下的日期），否则多园区请求会互相串数据。
const liveCache = new Map<string, CacheEntry<LiveWaitData[]>>();
const histCache = new Map<string, CacheEntry<HistoricalWaitData[]>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

export async function GET(req: NextRequest) {
  const parkId = req.nextUrl.searchParams.get("park") ?? "shanghai";
  const mode = req.nextUrl.searchParams.get("mode") ?? "live";
  const visitDate = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const park = getParkById(parkId);
  if (!park) return NextResponse.json({ error: "未知园区" }, { status: 400 });

  return mode === "historical"
    ? getPredictedData(parkId, park.queueTimesId, visitDate)
    : getLiveData(parkId, park.theparksApiId);
}

// ─── 实时等待时间（themeparks.wiki）────────────────────────────────────────
async function getLiveData(parkId: string, parkEntityId: string) {
  const cached = readCache(liveCache, parkId, LIVE_TTL_MS);
  if (cached) return NextResponse.json({ data: cached, cached: true, source: "themeparks.wiki" });

  try {
    const res = await fetch(`${THEMEPARKS_BASE}/entity/${parkEntityId}/live`, {
      next: { revalidate: LIVE_TTL_MS / 1000 },
    });
    if (!res.ok) throw new Error(`themeparks.wiki responded ${res.status}`);
    const json = await res.json();

    // 接口返回的 id 是 entity UUID，必须映射回内部 slug，否则下游 join 全部落空。
    let unmapped = 0;
    const liveData: LiveWaitData[] = [];
    for (const item of json.liveData ?? []) {
      if (item.entityType !== "ATTRACTION") continue;
      const rideId = rideIdFromThemeparks(parkId, item.id);
      if (!rideId) {
        unmapped++;
        continue;
      }
      liveData.push({
        rideId,
        waitMinutes: item.queue?.STANDBY?.waitTime ?? null,
        status: normalizeStatus(item.status),
        lastUpdated: item.lastUpdated ?? new Date().toISOString(),
      });
    }

    liveCache.set(parkId, { data: liveData, ts: Date.now() });
    return NextResponse.json({
      data: liveData,
      cached: false,
      park: park_name(parkId),
      source: "themeparks.wiki",
      unmappedEntities: unmapped,
    });
  } catch (err: any) {
    return NextResponse.json({
      data: getMockWaitTimes(),
      fallback: true,
      error: err.message,
    });
  }
}

// ─── 预测等待时间（Queue-Times 当前快照 × 日期系数）─────────────────────────
// 注意：这是基于「当前快照」的启发式，不是真正的历史回归。真实历史模型见
// scripts/collect_wait_snapshots.py 采集的数据与 src/lib/wait-prediction.ts。
async function getPredictedData(parkId: string, qtParkId: number | undefined, visitDate: string) {
  if (!qtParkId) {
    return NextResponse.json({ data: getMockHistorical(), fallback: true });
  }

  const cacheKey = `${parkId}:${visitDate}`;
  const cached = readCache(histCache, cacheKey, HIST_TTL_MS);
  if (cached) return NextResponse.json({ data: cached, cached: true, source: "queue-times.com" });

  try {
    const res = await fetch(`${QUEUE_TIMES_BASE}/${qtParkId}/queue_times.json`);
    if (!res.ok) throw new Error(`Queue-Times responded ${res.status}`);
    const json = await res.json();

    const dayOfWeek = new Date(visitDate).getDay();
    const isHoliday = isChineseHoliday(visitDate);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const factor = isHoliday ? 1.4 : isWeekend ? 1.2 : 1.0;
    const factorLabel = isHoliday ? "，节假日系数 ×1.4" : isWeekend ? "，周末系数 ×1.2" : "";

    const allRides = [
      ...(json.lands ?? []).flatMap((l: any) => l.rides ?? []),
      ...(json.rides ?? []),
    ];

    const predicted: HistoricalWaitData[] = [];
    for (const ride of allRides) {
      const rideId = rideIdFromQueueTimes(parkId, ride.id);
      if (!rideId) continue;
      predicted.push({
        rideId,
        predictedWait: Math.round((ride.wait_time ?? 30) * factor),
        confidence: "low",
        basis: `当前排队快照${factorLabel}`,
      });
    }

    histCache.set(cacheKey, { data: predicted, ts: Date.now() });
    return NextResponse.json({ data: predicted, cached: false, source: "queue-times.com" });
  } catch (err: any) {
    return NextResponse.json({ data: getMockHistorical(), fallback: true, error: err.message });
  }
}

function park_name(parkId: string) {
  return getParkById(parkId)?.name;
}

// ─── 中国法定节假日（主要节日，按公历日期）────────────────────────────────
function isChineseHoliday(dateStr: string): boolean {
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
function getMockWaitTimes(): LiveWaitData[] {
  const now = new Date().toISOString();
  const waits: Record<string, number | null> = {
    tron: 85, "roaring-rapids": 40, "seven-dwarfs": 55, soaring: 60,
    pirates: 25, "peter-pan": 45, "buzz-lightyear": 20, "stunt-show": null,
  };
  return Object.entries(waits).map(([rideId, waitMinutes]) => ({
    rideId, waitMinutes, status: "operating" as const, lastUpdated: now,
  }));
}

function getMockHistorical(): HistoricalWaitData[] {
  return [
    { rideId: "tron", predictedWait: 75, confidence: "low", basis: "降级默认值" },
    { rideId: "soaring", predictedWait: 55, confidence: "low", basis: "降级默认值" },
    { rideId: "seven-dwarfs", predictedWait: 45, confidence: "low", basis: "降级默认值" },
    { rideId: "pirates", predictedWait: 20, confidence: "low", basis: "降级默认值" },
    { rideId: "peter-pan", predictedWait: 35, confidence: "low", basis: "降级默认值" },
    { rideId: "roaring-rapids", predictedWait: 30, confidence: "low", basis: "降级默认值" },
    { rideId: "buzz-lightyear", predictedWait: 15, confidence: "low", basis: "降级默认值" },
    { rideId: "stunt-show", predictedWait: 0, confidence: "low", basis: "固定场次" },
  ];
}
