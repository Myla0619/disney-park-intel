import { describe, it, expect } from "vitest";
import {
  SHANGHAI_PROVIDER_IDS,
  rideIdFromThemeparks,
  rideIdFromQueueTimes,
  providerIdsForRide,
} from "../provider-ids";
import { getRidesByPark } from "../parks-data";

describe("provider-ids 映射表完整性", () => {
  it("园区内每个项目都在映射表里有条目（含显式标 null 的演出）", () => {
    const missing = getRidesByPark("shanghai")
      .map((r) => r.id)
      .filter((id) => !(id in SHANGHAI_PROVIDER_IDS));
    expect(missing).toEqual([]);
  });

  it("映射表里没有指向不存在项目的条目", () => {
    const rideIds = new Set(getRidesByPark("shanghai").map((r) => r.id));
    const orphans = Object.keys(SHANGHAI_PROVIDER_IDS).filter((id) => !rideIds.has(id));
    expect(orphans).toEqual([]);
  });

  it("themeparks UUID 不重复", () => {
    const ids = Object.values(SHANGHAI_PROVIDER_IDS)
      .map((v) => v.themeparks)
      .filter((v): v is string => v !== null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Queue-Times 数字 ID 不重复", () => {
    const ids = Object.values(SHANGHAI_PROVIDER_IDS)
      .map((v) => v.queueTimes)
      .filter((v): v is number => v !== null);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("反查", () => {
  it("themeparks UUID 反查回内部 slug", () => {
    expect(rideIdFromThemeparks("shanghai", "72d2c957-0280-4bfa-b2fc-5c70913a613b")).toBe("tron");
  });

  it("Queue-Times 数字 ID 反查回内部 slug（数字与字符串都接受）", () => {
    expect(rideIdFromQueueTimes("shanghai", 2985)).toBe("tron");
    expect(rideIdFromQueueTimes("shanghai", "2985")).toBe("tron");
  });

  it("未收录的外部 ID 返回 null，而不是误配到某个项目", () => {
    expect(rideIdFromThemeparks("shanghai", "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(rideIdFromQueueTimes("shanghai", 999999)).toBeNull();
    expect(rideIdFromQueueTimes("orlando", 2985)).toBeNull();
  });

  it("正查与反查互为逆运算", () => {
    for (const [rideId, ids] of Object.entries(SHANGHAI_PROVIDER_IDS)) {
      if (ids.themeparks) expect(rideIdFromThemeparks("shanghai", ids.themeparks)).toBe(rideId);
      if (ids.queueTimes) expect(rideIdFromQueueTimes("shanghai", ids.queueTimes)).toBe(rideId);
    }
  });

  it("providerIdsForRide 对未知项目返回 null", () => {
    expect(providerIdsForRide("shanghai", "tron")?.queueTimes).toBe(2985);
    expect(providerIdsForRide("shanghai", "不存在的项目")).toBeNull();
  });
});
