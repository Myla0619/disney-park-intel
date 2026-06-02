import { NextRequest, NextResponse } from "next/server";
import { PARKS, getParkById } from "@/lib/parks-data";
import { LiveWaitData, HistoricalWaitData } from "@/types";

const BASE = "https://api.themeparks.wiki/v1";
const QT_BASE = "https://queue-times.com/parks";

let _liveCache: { data: LiveWaitData[]; ts: number } | null = null;
let _histCache: { data: HistoricalWaitData[]; ts: number; key: string } | null = null;

// ─── 实时等待时间 ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const parkId = req.nextUrl.searchParams.get("park") ?? "shanghai";
  const mode = req.nextUrl.searchParams.get("mode") ?? "live"; // live | historical
  const visitDate = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const park = PARKS.find((p) => p.id === parkId);
  if (!park) return NextResponse.json({ error: "未知园区" }, { status: 400 });

  if (mode === "historical") {
    return getHistoricalData(park.queueTimesId, parkId, visitDate);
  }

  // 实时数据，2分钟缓存
  const now = Date.now();
  if (_liveCache && now - _liveCache.ts < 2 * 60 * 1000) {
    return NextResponse.json({ data: _liveCache.data, cached: true });
  }

  try {
    const res = await fetch(`${BASE}/entity/${park.theparksApiId}/live`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();

    const liveData: LiveWaitData[] = (json.liveData ?? [])
      .filter((item: any) => item.entityType === "ATTRACTION")
      .map((item: any) => ({
        rideId: item.id,
        waitMinutes: item.queue?.STANDBY?.waitTime ?? null,
        status: normalizeStatus(item.status),
        lastUpdated: item.lastUpdated ?? new Date().toISOString(),
      }));

    _liveCache = { data: liveData, ts: now };
    return NextResponse.json({ data: liveData, cached: false, park: park.name });
  } catch (err: any) {
    return NextResponse.json({
      data: getMockWaitTimes(parkId),
      fallback: true,
      error: err.message,
    });
  }
}

// ─── 历史加权预测（Queue-Times.com） ───────────────────────────────────────
async function getHistoricalData(qtParkId: number | undefined, parkId: string, visitDate: string) {
  if (!qtParkId) {
    return NextResponse.json({ data: getMockHistorical(parkId), fallback: true });
  }

  const cacheKey = `${parkId}-${visitDate}`;
  const now = Date.now();
  if (_histCache && _histCache.key === cacheKey && now - _histCache.ts < 30 * 60 * 1000) {
    return NextResponse.json({ data: _histCache.data, cached: true });
  }

  try {
    // Queue-Times 历史数据接口
    const res = await fetch(`${QT_BASE}/${qtParkId}/queue_times.json`);
    if (!res.ok) throw new Error(`Queue-Times ${res.status}`);
    const json = await res.json();

    const target = new Date(visitDate);
    const dayOfWeek = target.getDay(); // 0=周日
    const isHoliday = checkChineseHoliday(visitDate);

    // 按项目计算加权预测
    const allRides = (json.lands ?? []).flatMap((l: any) => l.rides ?? []);
    const predicted: HistoricalWaitData[] = allRides.map((ride: any) => {
      const baseWait = ride.wait_time ?? 30;
      // 节假日系数
      const holidayFactor = isHoliday ? 1.4 : [0, 6].includes(dayOfWeek) ? 1.2 : 1.0;
      const predicted = Math.round(baseWait * holidayFactor);

      return {
        rideId: ride.id?.toString(),
        predictedWait: predicted,
        confidence: "medium" as const,
        basis: `基于近期数据${isHoliday ? "，节假日系数×1.4" : [0,6].includes(dayOfWeek) ? "，周末系数×1.2" : ""}`,
      };
    });

    _histCache = { data: predicted, ts: now, key: cacheKey };
    return NextResponse.json({ data: predicted, cached: false });
  } catch (err: any) {
    return NextResponse.json({ data: getMockHistorical(parkId), fallback: true, error: err.message });
  }
}

// ─── 中国节假日判断（主要节日） ────────────────────────────────────────────
function checkChineseHoliday(dateStr: string): boolean {
  const holidays = [
    "01-01", // 元旦
    "05-01", "05-02", "05-03", // 劳动节
    "10-01", "10-02", "10-03", "10-04", "10-05", "10-06", "10-07", // 国庆
  ];
  const mmdd = dateStr.slice(5, 10);
  return holidays.includes(mmdd);
}

function normalizeStatus(s: string): LiveWaitData["status"] {
  const map: Record<string, LiveWaitData["status"]> = {
    OPERATING: "operating", DOWN: "down", CLOSED: "closed", REFURBISHMENT: "refurbishment",
  };
  return map[s] ?? "operating";
}

function getMockWaitTimes(parkId: string): LiveWaitData[] {
  return [
    { rideId: "tron", waitMinutes: 85, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "roaring-rapids", waitMinutes: 40, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "seven-dwarfs", waitMinutes: 55, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "soaring", waitMinutes: 60, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "pirates", waitMinutes: 25, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "peter-pan", waitMinutes: 45, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "buzz-lightyear", waitMinutes: 20, status: "operating", lastUpdated: new Date().toISOString() },
    { rideId: "stunt-show", waitMinutes: null, status: "operating", lastUpdated: new Date().toISOString() },
  ];
}

function getMockHistorical(parkId: string): HistoricalWaitData[] {
  return [
    { rideId: "tron", predictedWait: 75, confidence: "high", basis: "近4周同星期均值" },
    { rideId: "soaring", predictedWait: 55, confidence: "high", basis: "近4周同星期均值" },
    { rideId: "seven-dwarfs", predictedWait: 45, confidence: "medium", basis: "近1周均值" },
    { rideId: "pirates", predictedWait: 20, confidence: "medium", basis: "近1周均值" },
    { rideId: "peter-pan", predictedWait: 35, confidence: "medium", basis: "近1周均值" },
    { rideId: "roaring-rapids", predictedWait: 30, confidence: "low", basis: "历史基准" },
    { rideId: "buzz-lightyear", predictedWait: 15, confidence: "medium", basis: "近1周均值" },
    { rideId: "stunt-show", predictedWait: 0, confidence: "high", basis: "固定场次" },
  ];
}
