import { describe, it, expect } from "vitest";
import { recommendedMealTime, isPeakTime, normalizeDiningPlans, mealDuration, inferMealType } from "../dining";
import { buildRoute, buildAnchors, timeToMin } from "../routing";
import { getRidesByPark, getRestaurants } from "../parks-data";
import { UserProfile, RideScore, DiningPlan } from "@/types";

const base = {
  mode: "casual", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-29",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [],
  watchParade: false, paradeTime: "15:45", watchFireworks: false, fireworksTime: "21:00",
  routeProfile: "balanced", diningPreference: "normal",
  focusPhoto: false, focusShopping: false, selectedRestaurants: [],
} as unknown as UserProfile;

describe("推荐用餐时间", () => {
  it("午餐推荐避开 12:00-13:30 高峰", () => {
    const t = recommendedMealTime("lunch", base);
    expect(isPeakTime("lunch", t)).toBe(false);
  });

  it("晚餐推荐避开 18:00-19:30 高峰", () => {
    expect(isPeakTime("dinner", recommendedMealTime("dinner", base))).toBe(false);
  });

  it("要看烟花时晚餐提前，不会吃到一半赶去占位", () => {
    const withFireworks = { ...base, watchFireworks: true, fireworksTime: "20:00" } as UserProfile;
    const t = timeToMin(recommendedMealTime("dinner", withFireworks));
    const prepStart = timeToMin("20:00") - 30;
    expect(t + mealDuration(withFireworks, "dinner")).toBeLessThanOrEqual(prepStart);
  });

  it("推荐时间落在入园与离园之间", () => {
    const late = { ...base, arrivalTime: "16:00", departureTime: "21:00" } as UserProfile;
    const t = timeToMin(recommendedMealTime("dinner", late));
    expect(t).toBeGreaterThanOrEqual(timeToMin("16:00"));
    expect(t).toBeLessThan(timeToMin("21:00"));
  });
});

describe("normalizeDiningPlans", () => {
  const plan = (mealType: any, time: string, isReservation = false): DiningPlan =>
    ({ restaurantId: `r-${time}`, mealType, time, isReservation });

  it("同一餐只保留一条", () => {
    const out = normalizeDiningPlans([plan("lunch", "11:30"), plan("lunch", "12:30")]);
    expect(out).toHaveLength(1);
  });

  it("预约优先于「打算吃」", () => {
    const out = normalizeDiningPlans([plan("lunch", "12:30", true), plan("lunch", "11:30", false)]);
    expect(out[0].isReservation).toBe(true);
    expect(out[0].time).toBe("12:30");
  });

  it("按时间排序", () => {
    const out = normalizeDiningPlans([plan("dinner", "18:00"), plan("lunch", "11:30")]);
    expect(out.map((p) => p.mealType)).toEqual(["lunch", "dinner"]);
  });
});

describe("排程遵守用餐安排", () => {
  const rides = getRidesByPark("shanghai");
  const parkHours = { open: "08:30", close: "22:00", source: "estimated" as const };
  const scores: RideScore[] = rides.map((r) => ({
    rideId: r.id, overallScore: 80, waitScore: 70, sentimentScore: 70,
    profileMatchScore: 80, reasoning: "", recommended: true, priority: "must-do",
  }));

  const run = (profile: UserProfile) =>
    buildRoute({
      rides, scores, historical: [], live: [], profile,
      startArea: "entrance", parkHours, anchors: buildAnchors(profile, parkHours),
    });

  const reserved = getRestaurants("shanghai").find((r) => r.requiresReservation)!;

  it("已预约的餐厅精确排在预约时间", () => {
    // 回归测试：此前用餐时间写死 11:30，订了 12:30 也照 11:30 排，预约等于白订
    const profile = {
      ...base,
      selectedRestaurants: [reserved.id],
      diningPlans: [{ restaurantId: reserved.id, mealType: "lunch", time: "12:30", isReservation: true }],
    } as unknown as UserProfile;

    const item = run(profile).find((i) => i.itemId === reserved.id);
    expect(item, "预约餐厅未排入").toBeTruthy();
    expect(item!.time).toBe("12:30");
  });

  it("预约时段被其它项目让开，不产生重叠", () => {
    const profile = {
      ...base,
      selectedRestaurants: [reserved.id],
      diningPlans: [{ restaurantId: reserved.id, mealType: "lunch", time: "12:30", isReservation: true }],
    } as unknown as UserProfile;

    const items = run(profile).filter((i) => i.type !== "walk");
    const meal = items.find((i) => i.itemId === reserved.id)!;
    const s = timeToMin(meal.time);
    const e = timeToMin(meal.endTime);
    for (const other of items) {
      if (other.itemId === reserved.id) continue;
      const os = timeToMin(other.time);
      const oe = timeToMin(other.endTime);
      expect(os < e && oe > s, `${other.itemName} 与预约时段重叠`).toBe(false);
    }
  });

  it("「打算吃」只是软约束，用餐安排在指定时间附近", () => {
    const profile = {
      ...base,
      diningPlans: [{ restaurantId: reserved.id, mealType: "lunch", time: "13:00", isReservation: false }],
    } as unknown as UserProfile;

    const meal = run(profile).find((i) => i.type === "meal");
    expect(meal).toBeTruthy();
    // 软约束允许浮动，但不该偏离到另一个用餐时段去
    expect(Math.abs(timeToMin(meal!.time) - timeToMin("13:00"))).toBeLessThanOrEqual(90);
  });

  it("没填用餐安排时沿用默认时段，行为不变", () => {
    expect(run(base).some((i) => i.type === "meal")).toBe(true);
  });
});

describe("inferMealType", () => {
  it("依据餐厅支持的餐段推断", () => {
    for (const r of getRestaurants("shanghai")) {
      expect(["breakfast", "lunch", "dinner", "snack"]).toContain(inferMealType(r));
    }
  });
});
