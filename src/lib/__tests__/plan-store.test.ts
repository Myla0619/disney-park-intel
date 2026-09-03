import { describe, it, expect, vi, afterEach } from "vitest";
import { planFingerprint, isPlanUsable, CachedPlan } from "../plan-store";
import { UserProfile } from "@/types";

const profile = (o: Partial<UserProfile> = {}) =>
  ({
    mode: "casual", park: "shanghai", thrillLevel: 3,
    arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-29",
    kids: [], mobilityNeeds: false, llPackage: "none",
    singlePassRides: [], bundle3Rides: [],
    watchParade: false, paradeTime: "15:45", watchFireworks: false, fireworksTime: "21:00",
    routeProfile: "balanced", diningPreference: "normal",
    focusPhoto: false, focusShopping: false, selectedRestaurants: [],
    ...o,
  }) as UserProfile;

const plan = (fingerprint: string, o: Partial<CachedPlan> = {}): CachedPlan => ({
  fingerprint,
  itinerary: [],
  scores: [],
  parkHours: null,
  isToday: false,
  stage: "polished",
  computedAt: Date.now(),
  ...o,
});

afterEach(() => vi.useRealTimers());

describe("planFingerprint", () => {
  it("相同输入得到相同指纹", () => {
    expect(planFingerprint(profile(), [], "entrance")).toBe(planFingerprint(profile(), [], "entrance"));
  });

  it("想去清单的勾选顺序不影响指纹", () => {
    // 否则先勾 A 后勾 B 与反过来会被判成不同输入，白白重算一轮
    expect(planFingerprint(profile(), ["a", "b"], "entrance"))
      .toBe(planFingerprint(profile(), ["b", "a"], "entrance"));
  });

  it("改变游玩模式会改变指纹", () => {
    expect(planFingerprint(profile({ mode: "thrill" }), [], "entrance"))
      .not.toBe(planFingerprint(profile(), [], "entrance"));
  });

  it("改变用餐安排会改变指纹", () => {
    const withPlan = profile({
      diningPlans: [{ restaurantId: "royal-banquet", mealType: "lunch", time: "12:30", isReservation: true }],
    } as any);
    expect(planFingerprint(withPlan, [], "entrance")).not.toBe(planFingerprint(profile(), [], "entrance"));
  });

  it("改变起点区域会改变指纹", () => {
    expect(planFingerprint(profile(), [], "treasure")).not.toBe(planFingerprint(profile(), [], "entrance"));
  });

  it("加入想去清单会改变指纹", () => {
    expect(planFingerprint(profile(), ["tron"], "entrance")).not.toBe(planFingerprint(profile(), [], "entrance"));
  });
});

describe("isPlanUsable", () => {
  const fp = "fp-1";

  it("没有缓存时不可用", () => {
    expect(isPlanUsable(null, fp)).toBe(false);
  });

  it("指纹不一致时不可用", () => {
    expect(isPlanUsable(plan("fp-other"), fp)).toBe(false);
  });

  it("指纹一致且新鲜时可用——这正是「看个详情返回不该重算」的依据", () => {
    expect(isPlanUsable(plan(fp), fp)).toBe(true);
  });

  it("当天行程 10 分钟后过期，因为实时排队会变", () => {
    vi.useFakeTimers();
    const p = plan(fp, { isToday: true, computedAt: Date.now() });
    expect(isPlanUsable(p, fp)).toBe(true);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(isPlanUsable(p, fp)).toBe(false);
  });

  it("提前规划的行程保留 12 小时", () => {
    vi.useFakeTimers();
    const p = plan(fp, { isToday: false, computedAt: Date.now() });
    vi.advanceTimersByTime(11 * 60 * 60 * 1000);
    expect(isPlanUsable(p, fp)).toBe(true);
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(isPlanUsable(p, fp)).toBe(false);
  });
});
