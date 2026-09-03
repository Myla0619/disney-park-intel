import { describe, it, expect } from "vitest";
import { buildRoute, buildAnchors, timeToMin } from "../routing";
import { getRidesByPark } from "../parks-data";
import { UserProfile, RideScore } from "@/types";

const rides = getRidesByPark("shanghai");
const parkHours = { open: "08:30", close: "22:00", source: "estimated" as const };

const profile = {
  mode: "casual", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "22:00", visitDate: "2026-08-22",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [],
  watchParade: true, paradeTime: "15:45",
  watchFireworks: true, fireworksTime: "21:00",
  routeProfile: "balanced", diningPreference: "normal",
  focusPhoto: false, focusShopping: false, selectedRestaurants: [],
} as unknown as UserProfile;

const scores: RideScore[] = rides.map((r) => ({
  rideId: r.id, overallScore: 80, waitScore: 70, sentimentScore: 70,
  profileMatchScore: 80, reasoning: "", recommended: true, priority: "must-do",
}));

const route = (nowMin?: number) =>
  buildRoute({
    rides, scores, historical: [], live: [], profile,
    startArea: "entrance", parkHours,
    anchors: buildAnchors(profile, parkHours, nowMin),
    nowMin,
  });

describe("当天行程从此刻开始", () => {
  it("不传 nowMin 时从入园时间开始（提前规划的场景）", () => {
    const items = route();
    expect(timeToMin(items[0].time)).toBeGreaterThanOrEqual(timeToMin("09:00"));
  });

  it("下午 14:30 打开时，不再排出已经过去的上午行程", () => {
    // 回归测试：此前 startMin 恒为 max(入园时间, 开园时间)，人在园里下午重新规划，
    // 排出来的整个上午都是过去时间，整份行程等于废纸
    const nowMin = timeToMin("14:30");
    const items = route(nowMin);
    const tooEarly = items.filter((i) => timeToMin(i.time) < nowMin && !i.isAnchor);
    expect(tooEarly).toEqual([]);
  });

  it("晚上 19:00 打开仍能排出剩余时段的项目", () => {
    const items = route(timeToMin("19:00"));
    expect(items.length).toBeGreaterThan(0);
    expect(timeToMin(items[items.length - 1].endTime)).toBeLessThanOrEqual(timeToMin("22:00") + 30);
  });

  it("已经开始的场次不再作为锚点排入", () => {
    // 17:00 打开时，15:45 的巡游早已结束
    const anchors = buildAnchors(profile, parkHours, timeToMin("17:00"));
    expect(anchors.some((a) => a.type === "parade")).toBe(false);
    // 21:00 的烟花还没开始，应保留
    expect(anchors.some((a) => a.type === "fireworks")).toBe(true);
  });

  it("尚未入园时（now 早于入园时间）仍从入园时间开始", () => {
    const items = route(timeToMin("07:00"));
    expect(timeToMin(items[0].time)).toBeGreaterThanOrEqual(timeToMin("09:00"));
  });

  it("临近离园时返回空行程而不是塞入排不下的项目", () => {
    const items = route(timeToMin("21:58"));
    const rideItems = items.filter((i) => i.type === "ride");
    expect(rideItems).toEqual([]);
  });
});
