import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getSessionStore, __resetSessionStore } from "../session-store";
import { createSession, getSession, addMessage, updateSession } from "../session-memory";
import { UserProfile } from "@/types";

const profile = {
  mode: "casual", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-22",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [],
} as unknown as UserProfile;

beforeEach(() => {
  __resetSessionStore();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("后端选择", () => {
  it("未配置 Upstash 时用进程内存储", () => {
    expect(getSessionStore().kind).toBe("memory");
  });

  it("配置了 Upstash 时切到 Redis", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    expect(getSessionStore().kind).toBe("redis");
  });

  it("只配置了一半时不切换（避免半配置状态下静默失败）", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    expect(getSessionStore().kind).toBe("memory");
  });
});

describe("TTL", () => {
  afterEach(() => vi.useRealTimers());

  it("超过 TTL 后读不到", async () => {
    vi.useFakeTimers();
    await getSessionStore().set("k", { v: 1 }, 60);
    expect(await getSessionStore().get("k")).toEqual({ v: 1 });
    vi.advanceTimersByTime(61_000);
    expect(await getSessionStore().get("k")).toBeNull();
  });
});

describe("会话读写", () => {
  it("创建后能读回", async () => {
    await createSession("s1", profile);
    expect((await getSession("s1"))?.sessionId).toBe("s1");
  });

  it("未创建的会话返回 null", async () => {
    expect(await getSession("从未创建")).toBeNull();
  });

  it("对话历史累积后被持久化", async () => {
    await createSession("s2", profile);
    await addMessage("s2", "user", "你好");
    await addMessage("s2", "assistant", "你好，有什么可以帮你");
    expect((await getSession("s2"))!.conversationHistory).toHaveLength(2);
  });

  it("对话历史只保留最近 20 条", async () => {
    await createSession("s3", profile);
    for (let i = 0; i < 25; i++) await addMessage("s3", "user", `第 ${i} 条`);
    const history = (await getSession("s3"))!.conversationHistory;
    expect(history).toHaveLength(20);
    expect(history[19].content).toBe("第 24 条");
  });

  it("偏好更新被持久化", async () => {
    await createSession("s4", profile);
    await updateSession("s4", { type: "max_wait", value: 30, timestamp: Date.now() });
    expect((await getSession("s4"))!.inferredPreferences.maxWaitMinutes).toBe(30);
  });

  it("更新不存在的会话返回 null 而不是抛异常", async () => {
    expect(await updateSession("不存在", { type: "max_wait", value: 30, timestamp: Date.now() })).toBeNull();
  });

  it("不同会话互不干扰", async () => {
    await createSession("a", profile);
    await createSession("b", profile);
    await addMessage("a", "user", "只属于 a");
    expect((await getSession("b"))!.conversationHistory).toHaveLength(0);
  });
});
