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

/**
 * 真实接口比对。
 *
 * 两个数据源随时可能重命名、下线或新增项目，映射表一旦漂移，实时等待时间会静默
 * 退化成静态值——没有任何报错，只是数据悄悄变旧。这组用例打真实接口，由
 * CI 的每日定时任务运行（npm run check:provider-ids），本地默认跳过以免让
 * 单测依赖网络。
 */
const LIVE = Boolean(process.env.CHECK_LIVE_PROVIDERS);

describe.skipIf(!LIVE)("与数据源实时比对", () => {
  const SHANGHAI_PARK_UUID = "ddc4357c-c148-4b36-9888-07894fe75e83";
  const QUEUE_TIMES_PARK_ID = 30;

  it("每个 themeparks UUID 在园区实体列表中仍然存在", async () => {
    const res = await fetch(`https://api.themeparks.wiki/v1/entity/${SHANGHAI_PARK_UUID}/children`);
    expect(res.ok, `themeparks.wiki 返回 ${res.status}`).toBe(true);
    const json = await res.json();
    const liveIds = new Set<string>((json.children ?? []).map((c: any) => c.id));

    const stale = Object.entries(SHANGHAI_PROVIDER_IDS)
      .filter(([, ids]) => ids.themeparks && !liveIds.has(ids.themeparks))
      .map(([rideId, ids]) => `${rideId} → ${ids.themeparks}`);

    expect(stale, "映射表中的 UUID 已从数据源消失，需要更新 provider-ids.ts").toEqual([]);
  }, 30_000);

  it("每个 Queue-Times 数字 ID 在园区项目列表中仍然存在", async () => {
    const res = await fetch(`https://queue-times.com/parks/${QUEUE_TIMES_PARK_ID}/queue_times.json`);
    expect(res.ok, `Queue-Times 返回 ${res.status}`).toBe(true);
    const json = await res.json();
    const liveIds = new Set<string>(
      [
        ...(json.lands ?? []).flatMap((l: any) => l.rides ?? []),
        ...(json.rides ?? []),
      ].map((r: any) => String(r.id))
    );

    const stale = Object.entries(SHANGHAI_PROVIDER_IDS)
      .filter(([, ids]) => ids.queueTimes && !liveIds.has(String(ids.queueTimes)))
      .map(([rideId, ids]) => `${rideId} → ${ids.queueTimes}`);

    expect(stale, "映射表中的数字 ID 已从数据源消失，需要更新 provider-ids.ts").toEqual([]);
  }, 30_000);

  it("已收录项目的覆盖率不低于 80%", async () => {
    const res = await fetch(`https://api.themeparks.wiki/v1/entity/${SHANGHAI_PARK_UUID}/live`);
    expect(res.ok).toBe(true);
    const json = await res.json();
    const attractions = (json.liveData ?? []).filter((d: any) => d.entityType === "ATTRACTION");
    const mapped = attractions.filter((d: any) => rideIdFromThemeparks("shanghai", d.id));

    // 数据源收录的项目多于本应用建模的 24 个（含未建模的小型体验），
    // 这里只要求本应用关心的那部分没有大面积失配。
    const coverage = mapped.length / Object.values(SHANGHAI_PROVIDER_IDS).filter((i) => i.themeparks).length;
    expect(coverage).toBeGreaterThanOrEqual(0.8);
  }, 30_000);
});
