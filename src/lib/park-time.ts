/**
 * 园区本地时间
 *
 * 服务端可能跑在任意时区（Vercel 默认 UTC），直接用 `new Date().getHours()` 会
 * 得到与园区差好几个小时的"现在"。所有与行程相关的时刻判断都必须走这里。
 */

import { getParkById } from "./parks-data";

const FALLBACK_TZ = "Asia/Shanghai";

function timeZoneOf(parkId: string): string {
  return getParkById(parkId)?.timezone ?? FALLBACK_TZ;
}

/** 园区当地的「当天第几分钟」。 */
export function nowMinutesInPark(parkId: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZoneOf(parkId),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** 园区当地日期，YYYY-MM-DD。用于判断用户填的游玩日期是否就是"今天"。 */
export function todayInPark(parkId: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZoneOf(parkId),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
