import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rateLimit, clientKey, __resetRateLimits } from "../rate-limit";

beforeEach(() => {
  __resetRateLimits();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("rateLimit", () => {
  it("窗口内放行到阈值为止", () => {
    for (let i = 1; i <= 3; i++) {
      expect(rateLimit("k", 3, 60_000).allowed, `第 ${i} 次`).toBe(true);
    }
    expect(rateLimit("k", 3, 60_000).allowed).toBe(false);
  });

  it("remaining 递减且不为负", () => {
    expect(rateLimit("k", 2, 60_000).remaining).toBe(1);
    expect(rateLimit("k", 2, 60_000).remaining).toBe(0);
    expect(rateLimit("k", 2, 60_000).remaining).toBe(0);
  });

  it("不同 key 的额度互不影响", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("窗口过期后额度重置", () => {
    rateLimit("k", 1, 60_000);
    expect(rateLimit("k", 1, 60_000).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit("k", 1, 60_000).allowed).toBe(true);
  });

  it("retryAfterSeconds 至少为 1，不会返回 0 导致客户端立即重试", () => {
    rateLimit("k", 1, 60_000);
    const r = rateLimit("k", 1, 60_000);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("clientKey", () => {
  const reqWith = (headers: Record<string, string>) => new Request("http://x", { headers });

  it("取 x-forwarded-for 的第一跳（代理链上的真实客户端）", () => {
    expect(clientKey(reqWith({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" }))).toBe("1.2.3.4");
  });

  it("没有 x-forwarded-for 时回落到 x-real-ip", () => {
    expect(clientKey(reqWith({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("两个头都没有时返回 unknown 而不是 undefined", () => {
    expect(clientKey(reqWith({}))).toBe("unknown");
  });
});
