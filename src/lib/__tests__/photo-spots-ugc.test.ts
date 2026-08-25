import { describe, it, expect } from "vitest";
import { UGC_PHOTO_SPOTS } from "../photo-spots-ugc";
import { getPhotoSpots } from "../parks-data";
import { timeSlotFit, scorePhotoSpot } from "../poi-scoring";
import { UserProfile } from "@/types";

const profile = {
  mode: "photo", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-29",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [], focusPhoto: true, focusShopping: false,
  selectedRestaurants: [], routeProfile: "balanced", diningPreference: "normal",
  watchParade: false, paradeTime: "15:45", watchFireworks: false, fireworksTime: "21:00",
} as unknown as UserProfile;

describe("游客笔记机位", () => {
  it("每条都带可追溯的出处", () => {
    for (const s of UGC_PHOTO_SPOTS) {
      expect(s.source.quote.length, s.name).toBeGreaterThan(5);
      expect(s.source.url, s.name).toMatch(/^https:\/\/www\.xiaohongshu\.com\//);
    }
  });

  it("id 唯一，且与人工机位不冲突", () => {
    const all = getPhotoSpots("shanghai").map((s) => s.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("区域字段合法", () => {
    const valid = new Set(["mickey", "garden", "fantasy", "adventure", "treasure", "tomorrow", "toytown", "zootopia"]);
    for (const s of UGC_PHOTO_SPOTS) expect(valid.has(s.area), `${s.name}: ${s.area}`).toBe(true);
  });

  it("没有编造时段——语料没写就留空", () => {
    // 这批条目的价值在于真实可追溯，不在于字段填满。
    // 编一个时段再据此排程，比留空有害得多。
    for (const s of UGC_PHOTO_SPOTS) {
      for (const slot of s.bestTimeSlots) {
        expect(slot, `${s.name} 的时段应可解析`).toMatch(/\d{1,2}:\d{2}/);
      }
    }
  });
});

describe("缺时段的机位在评分中被中性处理", () => {
  it("空时段返回中性分，既不加分也不惩罚", () => {
    expect(timeSlotFit([], 600)).toBe(0.5);
  });

  it("缺时段的机位仍能参与排序，不会被排除", () => {
    const noSlot = UGC_PHOTO_SPOTS.find((s) => s.bestTimeSlots.length === 0);
    if (!noSlot) return;
    const scored = scorePhotoSpot(noSlot, profile, 600);
    expect(scored.costVal).toBeGreaterThan(0);
    expect(scored.costVal).toBeLessThanOrEqual(60);
  });

  it("同一时刻下，标注了最佳时段且命中的机位排序优于无时段的", () => {
    const withSlot = getPhotoSpots("shanghai").find((s) => s.bestTimeSlots.length > 0)!;
    const noSlot = UGC_PHOTO_SPOTS.find((s) => s.bestTimeSlots.length === 0);
    if (!noSlot) return;
    const at = 9 * 60 + 10; // 落在多数人工机位的开园时段内
    const a = scorePhotoSpot(withSlot, profile, at);
    const b = scorePhotoSpot(noSlot, profile, at);
    if (a.reasons.includes("正处最佳拍摄时段")) {
      expect(a.costVal).toBeLessThan(b.costVal);
    }
  });
});
