import { describe, it, expect } from "vitest";
import { buildRoute, buildAnchors, timeToMin } from "../routing";
import { getRidesByPark } from "../parks-data";
import { UserProfile, RideScore } from "@/types";

const rides = getRidesByPark("shanghai");
const parkHours = { open: "08:30", close: "22:00", source: "estimated" as const };

const base = {
  mode: "casual", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "22:00", visitDate: "2026-08-19",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [],
  watchParade: false, paradeTime: "15:45",
  watchFireworks: false, fireworksTime: "21:00",
  routeProfile: "balanced", diningPreference: "normal",
  focusPhoto: false, focusShopping: false, selectedRestaurants: [],
};

const allMustDo: RideScore[] = rides.map((r) => ({
  rideId: r.id, overallScore: 80, waitScore: 70, sentimentScore: 70,
  profileMatchScore: 80, reasoning: "", recommended: true, priority: "must-do",
}));

function route(override: Record<string, unknown> = {}) {
  const profile = { ...base, ...override } as unknown as UserProfile;
  return buildRoute({
    rides, scores: allMustDo, historical: [], live: [], profile,
    startArea: "entrance", parkHours,
    anchors: buildAnchors(profile, parkHours),
  });
}

const rideCount = (items: ReturnType<typeof route>) => items.filter((i) => i.type === "ride").length;
const lastEnd = (items: ReturnType<typeof route>) => timeToMin(items[items.length - 1].endTime);

describe("锚点不应终结整个排程", () => {
  it("看巡游时，巡游之后仍然继续安排项目", () => {
    // 回归测试：候选项目与锚点冲突时原本直接 continue 而不推进时间游标，
    // 导致之后每个候选都从锚点前的同一时刻起算、全部冲突，排程在第一个锚点处停摆。
    const withParade = route({ watchParade: true });
    const paradeEnd = timeToMin(withParade.find((i) => i.type === "parade")!.endTime);
    const afterParade = withParade.filter(
      (i) => i.type === "ride" && timeToMin(i.time) >= paradeEnd
    );
    expect(afterParade.length).toBeGreaterThan(0);
  });

  it("加了锚点不应让游乐项目数量断崖式下降", () => {
    const plain = rideCount(route());
    const withParade = rideCount(route({ watchParade: true }));
    // 巡游占用约 50 分钟，合理损耗一两项；此前是从 9 项掉到 4 项
    expect(withParade).toBeGreaterThanOrEqual(plain - 2);
  });

  it("双锚点下行程仍延续到接近离园时间", () => {
    const both = route({ watchParade: true, watchFireworks: true });
    expect(lastEnd(both)).toBeGreaterThan(timeToMin("20:00"));
  });

  it("行程时间始终单调不减", () => {
    for (const override of [
      {}, { watchParade: true }, { watchFireworks: true },
      { watchParade: true, watchFireworks: true },
      { focusPhoto: true, watchParade: true },
      { mode: "thrill", llPackage: "vip33", watchFireworks: true },
    ]) {
      const items = route(override);
      for (let i = 0; i < items.length - 1; i++) {
        expect(
          timeToMin(items[i + 1].time),
          `${JSON.stringify(override)}: ${items[i].time} ${items[i].itemName} → ${items[i + 1].time} ${items[i + 1].itemName}`
        ).toBeGreaterThanOrEqual(timeToMin(items[i].time));
      }
    }
  });
});

describe("无限次套餐不受 Multi Pass 间隔限制", () => {
  it("VIP33 不应被 90 分钟间隔压成寥寥几项", () => {
    // 回归测试：90 分钟间隔是 Multi Pass 的预约约束，此前被套用到无限次套餐上，
    // 2688 元的 VIP33 只排出 2 个项目
    const vip = rideCount(route({ mode: "thrill", llPackage: "vip33", watchFireworks: true }));
    expect(vip).toBeGreaterThanOrEqual(4);
  });

  it("VIP33 下相邻游乐项目的间隔可以短于 90 分钟", () => {
    const items = route({ llPackage: "vip33" }).filter((i) => i.type === "ride");
    expect(items.length).toBeGreaterThan(1);
    const gaps = items.slice(1).map((it, i) => timeToMin(it.time) - timeToMin(items[i].time));
    expect(Math.min(...gaps)).toBeLessThan(90);
  });
});

describe("休息块", () => {
  it("单个休息块不超过 45 分钟", () => {
    for (const override of [
      { watchParade: true, watchFireworks: true },
      { mode: "thrill", llPackage: "vip33", watchFireworks: true },
      { arrivalTime: "16:00", watchFireworks: true },
    ]) {
      for (const item of route(override)) {
        if (item.type !== "rest") continue;
        expect(item.duration, `${JSON.stringify(override)} 出现 ${item.duration} 分钟的休息块`).toBeLessThanOrEqual(45);
      }
    }
  });
});

describe("用户自购的尊享卡项目必须排入", () => {
  const withPackage = (bundle3Rides: string[]) =>
    route({ mode: "family", kids: [{ age: 6, heightCm: 115 }], llPackage: "bundle3", bundle3Rides });

  it("三项套餐里符合身高的项目都会被排入", () => {
    // 回归测试：用户花 399 元指定了三项，但成本排序把其中两项挤掉，
    // 实际只排进一项。自选尊享卡项目是真金白银单独指定的，应提升为 must-do
    const items = withPackage(["soaring", "seven-dwarfs", "pirates"]);
    const ids = items.map((i) => i.itemId);
    for (const id of ["soaring", "seven-dwarfs", "pirates"]) {
      expect(ids, `${id} 未排入行程`).toContain(id);
    }
  });

  it("身高不足的项目即使买了卡也不排入", () => {
    // TRON 需要 122cm，孩子 115cm
    const items = withPackage(["tron", "soaring", "seven-dwarfs"]);
    expect(items.map((i) => i.itemId)).not.toContain("tron");
  });

  it("未购卡时不做优先级提升", () => {
    const items = route({ llPackage: "none" });
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("演出与巡游的等待时间", () => {
  it("缺数据时不套用游乐项目的 30 分钟排队默认值", () => {
    // 回归测试：演出没有常规排队，套用 30 分钟会让行程凭空多出大段虚构等待
    const shows = route().filter((i) => i.type === "show");
    expect(shows.length).toBeGreaterThan(0);
    for (const s of shows) {
      expect(s.estimatedWait, `${s.itemName} 等待 ${s.estimatedWait} 分`).toBeLessThanOrEqual(15);
    }
  });

  it("演出备注说的是提前占位而不是排队", () => {
    const show = route().find((i) => i.type === "show" && !i.llType);
    if (show) expect(show.note).toMatch(/提前.*到场占位/);
  });
});
