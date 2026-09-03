import { describe, it, expect } from "vitest";
import { toCount, toIso } from "../sources/xiaohongshu";

describe("toCount", () => {
  it("解析普通数字", () => {
    expect(toCount(1234)).toBe(1234);
    expect(toCount("560")).toBe(560);
  });

  it("解析中文万单位（直接 Number() 会得到 NaN）", () => {
    expect(toCount("1.2万")).toBe(12000);
    expect(toCount("3万")).toBe(30000);
  });

  it("解析英文 k / w 单位", () => {
    expect(toCount("2.5k")).toBe(2500);
    expect(toCount("1.5w")).toBe(15000);
  });

  it("无法解析时返回 0 而不是 NaN", () => {
    expect(toCount(null)).toBe(0);
    expect(toCount(undefined)).toBe(0);
    expect(toCount("赞")).toBe(0);
    expect(toCount(NaN)).toBe(0);
  });
});

describe("toIso", () => {
  it("秒级时间戳按秒解释", () => {
    expect(toIso(1755859200)).toBe(new Date(1755859200 * 1000).toISOString());
  });

  it("毫秒级时间戳按毫秒解释", () => {
    expect(toIso(1755859200000)).toBe(new Date(1755859200000).toISOString());
  });

  it("解析日期字符串", () => {
    expect(toIso("2026-05-20")).toBe(new Date("2026-05-20").toISOString());
  });

  it("无法解析时返回空串，由调用方回退到抓取时间", () => {
    expect(toIso("前天")).toBe("");
    expect(toIso(null)).toBe("");
    expect(toIso("")).toBe("");
  });
});
