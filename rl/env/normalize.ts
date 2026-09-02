/**
 * 把两个排队数据源的原始响应归一化成 LiveWaitData
 * （沙箱回放和线上实调走同一套归一化逻辑——record & replay 的意义所在）
 */

import type { LiveWaitData, Ride } from "@/types";
import { getRidesByPark } from "@/lib/parks-data";

// 外部 API 用英文名时的别名表（themeparks.wiki / queue-times 常见英文名 → 项目 id）
const EN_ALIASES: Record<string, string> = {
  "tron lightcycle": "tron",
  "tron lightcycle power run": "tron",
  "soaring over the horizon": "soaring",
  "seven dwarfs mine train": "seven-dwarfs",
  "pirates of the caribbean": "pirates",
  "battle for the sunken treasure": "pirates",
  "roaring rapids": "roaring-rapids",
  "zootopia hot pursuit": "zootopia-ride",
  "hot pursuit": "zootopia-ride",
  "buzz lightyear planet rescue": "buzz-lightyear",
  "peter pans flight": "peter-pan",
  "the many adventures of winnie the pooh": "winnie",
  "frozen a musical spectacular": "frozen",
  "rex racer": "dragon",
  "rexs racer": "dragon",
  "woody's roundup": "slinky-dash",
  "slinky dog spin": "alien-pizza",
  "jet packs": "jet-packs",
  "fantasia carousel": "carousel",
  "dumbo the flying elephant": "dumbo",
  "voyage to the crystal grotto": "crystal-grotto",
  "alice in wonderland maze": "alice-maze",
  "camp discovery": "exploration-trail",
  "explorer canoes": "canoe",
  "once upon a time adventure": "fantasy-tale",
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s·:：'’\-—_.,！!（）()]/g, "");
}

/** 外部 API 的项目名 → 我们的 ride id；匹配不上返回 null（不硬凑） */
export function matchRideId(apiName: string, rides: Ride[]): string | null {
  const n = norm(apiName);
  if (!n) return null;

  for (const ride of rides) {
    const rn = norm(ride.name);
    if (rn.includes(n) || n.includes(rn)) return ride.id;
    // 中文名常带英文后缀（如"创极速光轮 TRON Lightcycle Run"），拆开各自匹配
    const zhOnly = norm(ride.name.replace(/[A-Za-z0-9 ]+/g, ""));
    if (zhOnly && (n.includes(zhOnly) || zhOnly.includes(n))) return ride.id;
  }
  for (const [alias, id] of Object.entries(EN_ALIASES)) {
    if (n.includes(norm(alias))) return id;
  }
  return null;
}

type TpwLiveEntity = {
  name: string;
  entityType: string;
  status?: string;
  queue?: { STANDBY?: { waitTime: number | null } };
  showtimes?: { startTime: string; endTime?: string; type?: string }[];
  lastUpdated?: string;
};

export function normalizeThemeParksWiki(payload: any, parkId: string): LiveWaitData[] {
  const rides = getRidesByPark(parkId);
  const out: LiveWaitData[] = [];
  for (const e of (payload?.liveData ?? []) as TpwLiveEntity[]) {
    if (e.entityType !== "ATTRACTION") continue;
    const rideId = matchRideId(e.name, rides);
    if (!rideId) continue;
    out.push({
      rideId,
      waitMinutes: e.queue?.STANDBY?.waitTime ?? null,
      status:
        e.status === "OPERATING" ? "operating"
        : e.status === "DOWN" ? "down"
        : e.status === "REFURBISHMENT" ? "refurbishment"
        : "closed",
      lastUpdated: e.lastUpdated ?? "",
    });
  }
  return out;
}

export function extractShowtimes(payload: any): { name: string; startTimes: string[] }[] {
  const out: { name: string; startTimes: string[] }[] = [];
  for (const e of (payload?.liveData ?? []) as TpwLiveEntity[]) {
    if (!e.showtimes?.length) continue;
    out.push({
      name: e.name,
      startTimes: e.showtimes.map((s) => s.startTime.slice(11, 16)),
    });
  }
  return out;
}

type QtPayload = { lands?: { name: string; rides: { name: string; wait_time: number; is_open: boolean; last_updated?: string }[] }[] };

export function normalizeQueueTimes(payload: QtPayload, parkId: string): LiveWaitData[] {
  const rides = getRidesByPark(parkId);
  const out: LiveWaitData[] = [];
  for (const land of payload?.lands ?? []) {
    for (const r of land.rides ?? []) {
      const rideId = matchRideId(r.name, rides);
      if (!rideId) continue;
      out.push({
        rideId,
        waitMinutes: r.is_open ? r.wait_time : null,
        status: r.is_open ? "operating" : "closed",
        lastUpdated: r.last_updated ?? "",
      });
    }
  }
  return out;
}
