import { describe, it, expect } from "vitest";
import { LL_PACKAGES, LL_ELIGIBLE_RIDES, getPackageById, getUserLLRides, hasReservedSpot } from "../ll-packages";

describe("套餐配置", () => {
  it("套餐 ID 唯一", () => {
    const ids = LL_PACKAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个套餐覆盖的项目都在官方可购卡清单内", () => {
    for (const pkg of LL_PACKAGES) {
      const outside = pkg.rides.filter((id) => !LL_ELIGIBLE_RIDES.includes(id));
      expect(outside, `套餐 ${pkg.id} 含清单外项目`).toEqual([]);
    }
  });

  it("权益是单调的：有 VIP 通道必有巡游预留位，无限次必两者都有", () => {
    for (const pkg of LL_PACKAGES) {
      if (pkg.hasVIPEntrance) expect(pkg.hasReservedParade, pkg.id).toBe(true);
      if (pkg.unlimited) {
        expect(pkg.hasVIPEntrance, pkg.id).toBe(true);
        expect(pkg.hasReservedParade, pkg.id).toBe(true);
      }
    }
  });

  it("高阶套餐确实带巡游预留位（hasReservedSpot 的上游数据不为空）", () => {
    expect(LL_PACKAGES.filter((p) => p.hasReservedParade).length).toBeGreaterThan(0);
  });

  it("未知套餐 ID 返回 undefined", () => {
    expect(getPackageById("不存在的套餐")).toBeUndefined();
  });
});

describe("getUserLLRides", () => {
  const base = { llPackage: "none", singlePassRides: [], bundle3Rides: [] };

  it("未购卡时没有任何快通项目", () => {
    expect(getUserLLRides(base)).toEqual([]);
  });

  it("单项卡只认用户自选的项目，不返回全清单", () => {
    const out = getUserLLRides({ ...base, llPackage: "single", singlePassRides: ["tron"] });
    expect(out).toEqual(["tron"]);
  });

  it("三项套餐只认用户自选的三项", () => {
    const out = getUserLLRides({ ...base, llPackage: "bundle3", bundle3Rides: ["tron", "soaring", "pirates"] });
    expect(out).toEqual(["tron", "soaring", "pirates"]);
  });

  it("固定套餐返回套餐自带清单，忽略用户自选字段", () => {
    const pkg = LL_PACKAGES.find((p) => !p.unlimited && p.rides.length > 0 && !["single", "bundle3"].includes(p.id));
    if (!pkg) return;
    expect(getUserLLRides({ ...base, llPackage: pkg.id, singlePassRides: ["tron"] })).toEqual(pkg.rides);
  });

  it("未知套餐 ID 返回空数组而不是崩溃", () => {
    expect(getUserLLRides({ ...base, llPackage: "乱填的" })).toEqual([]);
  });
});

describe("hasReservedSpot", () => {
  it("未购卡时没有巡游预留位", () => {
    expect(hasReservedSpot("none")).toBe(false);
  });

  it("未知套餐 ID 返回 false 而不是抛异常", () => {
    expect(hasReservedSpot("乱填的")).toBe(false);
  });
});
