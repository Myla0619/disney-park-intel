import { describe, it, expect, beforeEach } from "vitest";
import { inferAndUpdatePreferences } from "../preference-inference";
import { createSession, getSession } from "../session-memory";
import { __resetSessionStore } from "../session-store";
import { UserProfile } from "@/types";

const SID = "test-session";

const baseProfile = {
  mode: "casual", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-19",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [],
} as unknown as UserProfile;

beforeEach(async () => {
  __resetSessionStore();
  await createSession(SID, baseProfile);
});

const prefs = async () => (await getSession(SID))!.inferredPreferences;
const area = async () => (await getSession(SID))!.currentArea;

describe("最长可接受排队时间", () => {
  it("识别「不想排超过 30 分钟」", async () => {
    await inferAndUpdatePreferences("我不想排队超过30分钟", SID);
    expect((await prefs()).maxWaitMinutes).toBe(30);
  });

  it("识别「最多等 45 分钟」", async () => {
    await inferAndUpdatePreferences("最多等45分钟吧", SID);
    expect((await prefs()).maxWaitMinutes).toBe(45);
  });

  it("没有时长表述时不写入", async () => {
    await inferAndUpdatePreferences("今天人多吗", SID);
    expect((await prefs()).maxWaitMinutes).toBeUndefined();
  });
});

describe("同行人员与忌讳", () => {
  it("识别恐高", async () => {
    await inferAndUpdatePreferences("我女朋友怕高，别安排太刺激的", SID);
    expect((await prefs()).fearHeight).toBe(true);
    expect((await prefs()).travelWith).toBe("girlfriend");
  });

  it("识别不想被水打湿", async () => {
    await inferAndUpdatePreferences("今天有点冷，不想湿", SID);
    expect((await prefs()).fearWater).toBe(true);
  });

  it("识别老人同行", async () => {
    await inferAndUpdatePreferences("和爸妈一起来的", SID);
    expect((await prefs()).travelWith).toBe("elderly");
  });

  it("识别婴幼儿同行", async () => {
    await inferAndUpdatePreferences("带着宝宝，走不快", SID);
    expect((await prefs()).travelWith).toBe("toddler");
  });
});

describe("当前位置", () => {
  it("识别「我现在在宝藏湾」", async () => {
    await inferAndUpdatePreferences("我现在在宝藏湾", SID);
    expect(await area()).toBe("treasure");
  });

  it("只提到区域名但没有位置语气时不写入", async () => {
    // "宝藏湾好玩吗" 是在问项目，不是在报位置
    await inferAndUpdatePreferences("宝藏湾好玩吗", SID);
    expect(await area()).toBeUndefined();
  });

  it("未提到任何区域时不写入", async () => {
    await inferAndUpdatePreferences("我现在有点累", SID);
    expect(await area()).toBeUndefined();
  });
});

describe("会话隔离", () => {
  it("写入不存在的会话时安全返回，不抛异常", async () => {
    await expect(inferAndUpdatePreferences("不想排队超过20分钟", "不存在的会话")).resolves.toBeUndefined();
  });
});
