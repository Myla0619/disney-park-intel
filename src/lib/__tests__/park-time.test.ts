import { describe, it, expect } from "vitest";
import { nowMinutesInPark, todayInPark } from "../park-time";

describe("园区本地时间", () => {
  // 2026-08-22T13:36Z = 上海时间 21:36（UTC+8）
  const utcEvening = new Date("2026-08-22T13:36:00Z");

  it("按园区时区换算，而不是服务端时区", () => {
    // 回归测试：服务端跑在 UTC 时，直接取 getHours() 会得到 13:36 而非 21:36，
    // 导致"今天从现在开始排程"整整错八小时
    expect(nowMinutesInPark("shanghai", utcEvening)).toBe(21 * 60 + 36);
  });

  it("跨日边界按园区时区判定日期", () => {
    // UTC 8/22 17:00 = 上海 8/23 01:00，日期已经翻篇
    const crossing = new Date("2026-08-22T17:00:00Z");
    expect(todayInPark("shanghai", crossing)).toBe("2026-08-23");
    expect(nowMinutesInPark("shanghai", crossing)).toBe(60);
  });

  it("未知园区回退到上海时区而不是崩溃", () => {
    expect(nowMinutesInPark("不存在的园区", utcEvening)).toBe(21 * 60 + 36);
  });

  it("园区当天日期格式为 YYYY-MM-DD", () => {
    expect(todayInPark("shanghai", utcEvening)).toBe("2026-08-22");
  });
});
