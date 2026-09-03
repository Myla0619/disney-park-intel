import { describe, it, expect } from "vitest";
import { minKidHeightCm, isHeightBlocked } from "../height";

const ride = (heightRequirement: number | null) => ({ heightRequirement });

describe("minKidHeightCm", () => {
  it("没有孩子时返回 null（表示无身高约束）", () => {
    expect(minKidHeightCm({ kids: [] })).toBeNull();
    expect(minKidHeightCm({ kids: undefined as any })).toBeNull();
  });

  it("取团队中最矮的孩子", () => {
    expect(minKidHeightCm({ kids: [{ age: 8, heightCm: 130 }, { age: 4, heightCm: 98 }] })).toBe(98);
  });
});

describe("isHeightBlocked", () => {
  it("项目无身高限制时永不阻拦", () => {
    expect(isHeightBlocked(ride(null), { kids: [{ age: 2, heightCm: 85 }] })).toBe(false);
  });

  it("没有孩子同行时不阻拦", () => {
    expect(isHeightBlocked(ride(122), { kids: [] })).toBe(false);
  });

  it("身高恰好等于限制值判定为可乘坐（园方规则是 >=）", () => {
    expect(isHeightBlocked(ride(122), { kids: [{ age: 9, heightCm: 122 }] })).toBe(false);
  });

  it("比限制值矮 1cm 即阻拦", () => {
    expect(isHeightBlocked(ride(122), { kids: [{ age: 9, heightCm: 121 }] })).toBe(true);
  });

  it("只要有一个孩子不够高就阻拦", () => {
    const profile = { kids: [{ age: 10, heightCm: 140 }, { age: 4, heightCm: 100 }] };
    expect(isHeightBlocked(ride(122), profile)).toBe(true);
  });

  it("不按年龄推算身高：年龄大但身高不足仍应阻拦", () => {
    // 回归测试：曾用 min(70 + age*6, 160) 估算，10 岁会被算成 130cm 而放行
    expect(isHeightBlocked(ride(122), { kids: [{ age: 10, heightCm: 118 }] })).toBe(true);
  });
});
