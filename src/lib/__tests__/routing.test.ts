import { describe, it, expect } from "vitest";
import { getEffectiveWait, timeToMin, minToTime, buildAnchors } from "../routing";
import { getRideById, getRidesByPark } from "../parks-data";
import { LL_ELIGIBLE_RIDES } from "../ll-packages";
import { UserProfile } from "@/types";

const tron = getRideById("tron")!;

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    mode: "casual",
    park: "shanghai",
    thrillLevel: 3,
    arrivalTime: "09:00",
    departureTime: "21:00",
    visitDate: "2026-08-19",
    kids: [],
    mobilityNeeds: false,
    llPackage: "none",
    singlePassRides: [],
    bundle3Rides: [],
    ...overrides,
  } as UserProfile;
}

describe("timeToMin / minToTime", () => {
  it("互为逆运算", () => {
    expect(timeToMin("09:30")).toBe(570);
    expect(minToTime(570)).toBe("09:30");
    expect(minToTime(timeToMin("21:05"))).toBe("21:05");
  });
});

describe("getEffectiveWait 数据源优先级", () => {
  it("实测值优先于预测值", () => {
    // 回归测试：此前 hist 优先，导致"今天入园"的真实排队被启发式预测覆盖
    const wait = getEffectiveWait(
      tron,
      profile(),
      [{ rideId: "tron", predictedWait: 120, confidence: "low", basis: "快照外推" }],
      [{ rideId: "tron", waitMinutes: 40, status: "operating", lastUpdated: "" }],
      600
    );
    expect(wait).toBe(40);
  });

  it("没有实测值时回落到预测值", () => {
    const wait = getEffectiveWait(
      tron, profile(),
      [{ rideId: "tron", predictedWait: 120, confidence: "low", basis: "" }],
      [], 600
    );
    expect(wait).toBe(120);
  });

  it("两者都没有时回落到项目静态基准", () => {
    const wait = getEffectiveWait(tron, profile(), [], [], 600);
    expect(wait).toBe(tron.waitTime ?? 30);
  });
});

describe("getEffectiveWait 异常值保护", () => {
  const live = (waitMinutes: number) => [
    { rideId: "tron", waitMinutes, status: "operating" as const, lastUpdated: "" },
  ];

  it("负数视为异常，回落到 30 分钟", () => {
    expect(getEffectiveWait(tron, profile(), [], live(-5), 600)).toBe(30);
  });

  it("超过 4 小时的数据截断到 240 分钟", () => {
    expect(getEffectiveWait(tron, profile(), [], live(600), 600)).toBe(240);
  });
});

describe("getEffectiveWait 优速通折扣", () => {
  const live = [{ rideId: "tron", waitMinutes: 100, status: "operating" as const, lastUpdated: "" }];

  it("未购买优速通时按全额排队", () => {
    expect(getEffectiveWait(tron, profile(), [], live, 600)).toBe(100);
  });

  it("单项尊享卡覆盖该项目时打 15 折", () => {
    const p = profile({ llPackage: "single", singlePassRides: ["tron"] });
    expect(getEffectiveWait(tron, p, [], live, 600)).toBe(15);
  });

  it("单项尊享卡未覆盖该项目时不打折", () => {
    const p = profile({ llPackage: "single", singlePassRides: ["soaring"] });
    expect(getEffectiveWait(tron, p, [], live, 600)).toBe(100);
  });

  it("VIP33 无限次套餐下可用快通项目一律记 5 分钟", () => {
    const p = profile({ llPackage: "vip33" });
    expect(getEffectiveWait(tron, p, [], live, 600)).toBe(5);
  });

  it("不支持快通的项目即使持 VIP33 也按原等待", () => {
    // frozen 不在官方尊享卡清单里，llEligible 由清单派生，故为 false
    const frozen = getRideById("frozen")!;
    expect(frozen.llEligible).toBe(false);
    const liveFrozen = [{ rideId: "frozen", waitMinutes: 100, status: "operating" as const, lastUpdated: "" }];
    const p = profile({ llPackage: "vip33" });
    expect(getEffectiveWait(frozen, p, [], liveFrozen, 600)).toBe(100);
  });
});

describe("buildAnchors", () => {
  const hours = { open: "08:30", close: "21:30", source: "estimated" as const };

  it("不看巡游与烟花时不产生锚点", () => {
    expect(buildAnchors(profile(), hours)).toEqual([]);
  });

  it("锚点早于入园时间时被跳过", () => {
    const p = profile({ arrivalTime: "17:00", watchParade: true, paradeTime: "15:45" } as any);
    const anchors = buildAnchors(p, hours);
    expect(anchors.some((a) => a.itemName.includes("巡游"))).toBe(false);
  });

  it("锚点晚于离园时间时被跳过", () => {
    const p = profile({ departureTime: "18:00", watchFireworks: true, fireworksTime: "21:00" } as any);
    const anchors = buildAnchors(p, hours);
    expect(anchors.some((a) => a.itemName.includes("烟花"))).toBe(false);
  });
});

describe("尊享卡资格的单一事实来源", () => {
  it("Ride.llEligible 与官方清单永远一致", () => {
    // 回归测试：两份手工清单曾在 4 个项目上分叉，UI 与路径规划各说各话
    const rides = getRidesByPark("shanghai");
    const flagged = rides.filter((r) => r.llEligible).map((r) => r.id).sort();
    expect(flagged).toEqual([...LL_ELIGIBLE_RIDES].filter((id) => rides.some((r) => r.id === id)).sort());
  });
});
