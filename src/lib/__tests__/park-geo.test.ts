import { describe, it, expect } from "vitest";
import { AREA_COORDS, nearestArea, isInsidePark, distanceMeters } from "../park-geo";

describe("distanceMeters", () => {
  it("同一点距离为 0", () => {
    expect(distanceMeters(AREA_COORDS.fantasy, AREA_COORDS.fantasy)).toBe(0);
  });

  it("园区跨度在合理量级（各区间距 100m–1km）", () => {
    const ids = Object.keys(AREA_COORDS);
    const dists: number[] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        dists.push(distanceMeters(AREA_COORDS[ids[i]], AREA_COORDS[ids[j]]));
    expect(Math.min(...dists)).toBeGreaterThan(100);
    expect(Math.max(...dists)).toBeLessThan(1000);
  });
});

describe("isInsidePark", () => {
  it("各区质心都在园区边界内", () => {
    for (const [id, c] of Object.entries(AREA_COORDS)) {
      expect(isInsidePark(c), id).toBe(true);
    }
  });

  it("上海市中心不在园区内", () => {
    expect(isInsidePark({ lat: 31.2304, lng: 121.4737 })).toBe(false);
  });

  it("另一半球不在园区内", () => {
    expect(isInsidePark({ lat: -33.8688, lng: 151.2093 })).toBe(false);
  });
});

describe("nearestArea", () => {
  it("站在某区质心上，识别为该区且可信度为 high", () => {
    for (const [id, c] of Object.entries(AREA_COORDS)) {
      const fix = nearestArea(c)!;
      expect(fix.areaId, id).toBe(id);
      expect(fix.distanceMeters).toBeLessThan(1);
      expect(fix.confidence).toBe("high");
    }
  });

  it("两区中点判为 medium，提示可能在交界处", () => {
    const a = AREA_COORDS.fantasy;
    const b = AREA_COORDS.garden;
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    expect(nearestArea(mid)!.confidence).toBe("medium");
  });

  it("不在园内时返回 null，而不是硬套一个最近的区", () => {
    // 关键：把不在园区的人定位到某个主题区，会给出完全错误的行程起点
    expect(nearestArea({ lat: 31.2304, lng: 121.4737 })).toBeNull();
  });

  it("GPS 误差 30 米不影响判定", () => {
    const c = AREA_COORDS.treasure;
    // 约 30 米的偏移
    const jittered = { lat: c.lat + 0.00027, lng: c.lng };
    expect(nearestArea(jittered)!.areaId).toBe("treasure");
  });
});
