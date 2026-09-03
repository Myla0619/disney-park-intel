import { describe, it, expect } from "vitest";
import {
  parseTimeSlot, timeSlotFit, shopTimeFit, photoProfileFit, shopProfileFit,
  scorePhotoSpot, scoreShop,
} from "../poi-scoring";
import { timeToMin } from "../routing-time";
import { getPhotoSpots, getShopSpots } from "../parks-data";
import { PhotoSpot, ShopSpot, UserProfile } from "@/types";

const profile = (o: Partial<UserProfile> = {}) =>
  ({
    mode: "casual", park: "shanghai", thrillLevel: 3,
    arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-29",
    kids: [], mobilityNeeds: false, llPackage: "none",
    singlePassRides: [], bundle3Rides: [],
    focusPhoto: false, focusShopping: false, selectedRestaurants: [],
    routeProfile: "balanced", diningPreference: "normal",
    watchParade: false, paradeTime: "15:45", watchFireworks: false, fireworksTime: "21:00",
    ...o,
  }) as UserProfile;

describe("parseTimeSlot", () => {
  it("解析标准时段", () => {
    expect(parseTimeSlot("09:00-09:30")).toEqual({ start: 540, end: 570 });
  });

  it("解析带前缀的时段（数据里有「烟花后21:00-21:20」这种写法）", () => {
    expect(parseTimeSlot("烟花后21:00-21:20")).toEqual({ start: 1260, end: 1280 });
  });

  it("无法解析时返回 null 而不是抛异常", () => {
    expect(parseTimeSlot("全天皆可")).toBeNull();
    expect(parseTimeSlot("")).toBeNull();
  });

  it("结束早于开始视为非法", () => {
    expect(parseTimeSlot("21:00-09:00")).toBeNull();
  });
});

describe("timeSlotFit", () => {
  const slots = ["09:00-09:30", "17:00-18:30"];

  it("落在最佳时段内得满分", () => {
    expect(timeSlotFit(slots, timeToMin("09:15"))).toBe(1);
    expect(timeSlotFit(slots, timeToMin("18:00"))).toBe(1);
  });

  it("距离越远得分越低", () => {
    const near = timeSlotFit(slots, timeToMin("10:00"));
    const far = timeSlotFit(slots, timeToMin("13:00"));
    expect(near).toBeGreaterThan(far);
  });

  it("两小时以外归零", () => {
    expect(timeSlotFit(["09:00-09:30"], timeToMin("14:00"))).toBe(0);
  });

  it("没有标注时段时返回中性值，不加分也不惩罚", () => {
    expect(timeSlotFit([], 600)).toBe(0.5);
    expect(timeSlotFit(["全天"], 600)).toBe(0.5);
  });
});

describe("shopTimeFit", () => {
  const open = timeToMin("08:30");
  const close = timeToMin("22:00");

  it("开园型商店在开园时刻得分最高", () => {
    const atOpen = shopTimeFit("opening", open, open, close);
    const atNoon = shopTimeFit("opening", timeToMin("13:00"), open, close);
    expect(atOpen).toBeGreaterThan(atNoon);
  });

  it("闭园前型商店在临近闭园时得分最高", () => {
    const late = shopTimeFit("before-closing", timeToMin("21:30"), open, close);
    const early = shopTimeFit("before-closing", timeToMin("10:00"), open, close);
    expect(late).toBeGreaterThan(early);
  });

  it("anytime 型给中性偏高的固定值", () => {
    expect(shopTimeFit("anytime", 600, open, close)).toBe(0.7);
  });

  it("得分不低于 0.2，避免时段不符时被完全排除", () => {
    expect(shopTimeFit("opening", close, open, close)).toBeGreaterThanOrEqual(0.2);
  });
});

describe("档案契合度", () => {
  const landmark = getPhotoSpots("shanghai").find((s) => s.photoType === "landmark")!;

  it("拍照模式提升拍照点契合度", () => {
    const base = photoProfileFit(landmark, profile());
    const photo = photoProfileFit(landmark, profile({ mode: "photo", focusPhoto: true }));
    expect(photo).toBeGreaterThan(base);
  });

  it("行动不便时，远离项目的机位契合度下降", () => {
    const far = { ...landmark, walkFromNearestRide: 12 } as PhotoSpot;
    expect(photoProfileFit(far, profile({ mobilityNeeds: true })))
      .toBeLessThan(photoProfileFit(far, profile()));
  });

  it("旗舰店契合度高于小货车", () => {
    const shops = getShopSpots("shanghai");
    const flagship = shops.find((s) => s.scale === "flagship")!;
    const kiosk = shops.find((s) => s.scale === "kiosk")!;
    expect(shopProfileFit(flagship, profile())).toBeGreaterThan(shopProfileFit(kiosk, profile()));
  });

  it("带娃时玩具类商店契合度提升", () => {
    const toyShop = getShopSpots("shanghai").find(
      (s) => s.categories.includes("玩具") && s.scale !== "kiosk"
    )!;
    const withKids = profile({ kids: [{ age: 6, heightCm: 115 }] } as any);
    expect(shopProfileFit(toyShop, withKids)).toBeGreaterThan(shopProfileFit(toyShop, profile()));
  });

  it("契合度始终落在 0-1 之间", () => {
    for (const s of getShopSpots("shanghai")) {
      const v = shopProfileFit(s, profile({ kids: [{ age: 2, heightCm: 85 }] } as any));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("综合评分", () => {
  it("同一机位在最佳时段的成本低于非最佳时段", () => {
    // 回归测试：此前拍照点 costVal 恒为 0，数据里的最佳时段完全不起作用——
    // 城堡机位标着「烟花后21:00-21:20」却可能被排在上午九点
    const castle = getPhotoSpots("shanghai").find((s) => s.bestTimeSlots.length > 0)!;
    const best = parseTimeSlot(castle.bestTimeSlots[0])!;
    const inSlot = scorePhotoSpot(castle, profile(), best.start + 5);
    const offSlot = scorePhotoSpot(castle, profile(), best.start + 300);
    expect(inSlot.costVal).toBeLessThan(offSlot.costVal);
    expect(inSlot.reasons).toContain("正处最佳拍摄时段");
  });

  it("旗舰店在开园时段的成本低于闭园前", () => {
    const flagship = getShopSpots("shanghai").find((s) => s.scale === "flagship")!;
    const open = timeToMin("08:30");
    const close = timeToMin("22:00");
    const early = scoreShop(flagship, profile(), open + 10, open, close);
    const late = scoreShop(flagship, profile(), close - 30, open, close);
    expect(early.costVal).toBeLessThan(late.costVal);
  });

  it("成本值落在与游乐项目同量纲的区间内", () => {
    for (const s of getPhotoSpots("shanghai")) {
      const c = scorePhotoSpot(s, profile(), 600).costVal;
      expect(c).toBeGreaterThanOrEqual(5);
      expect(c).toBeLessThanOrEqual(60);
    }
  });
});
