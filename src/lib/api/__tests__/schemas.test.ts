import { describe, it, expect } from "vitest";
import { UserProfileSchema, AgentBodySchema, WaitTimesQuerySchema, ReviewsQuerySchema } from "../schemas";

const validProfile = {
  mode: "family",
  kids: [{ age: 6, heightCm: 115 }],
  thrillLevel: 3,
  arrivalTime: "09:00",
  departureTime: "21:00",
  llPackage: "none",
  visitDate: "2026-08-22",
  park: "shanghai",
};

describe("UserProfileSchema", () => {
  it("接受最小合法档案，并为可选字段填默认值", () => {
    const r = UserProfileSchema.parse(validProfile);
    expect(r.routeProfile).toBe("balanced");
    expect(r.mobilityNeeds).toBe(false);
    expect(r.selectedRestaurants).toEqual([]);
  });

  it("拒绝非法时间格式", () => {
    expect(UserProfileSchema.safeParse({ ...validProfile, arrivalTime: "9点" }).success).toBe(false);
    expect(UserProfileSchema.safeParse({ ...validProfile, arrivalTime: "25:00" }).success).toBe(false);
  });

  it("拒绝非法日期格式", () => {
    expect(UserProfileSchema.safeParse({ ...validProfile, visitDate: "2026/08/22" }).success).toBe(false);
  });

  it("拒绝越界的身高与年龄", () => {
    expect(UserProfileSchema.safeParse({ ...validProfile, kids: [{ age: 6, heightCm: 5 }] }).success).toBe(false);
    expect(UserProfileSchema.safeParse({ ...validProfile, kids: [{ age: 99, heightCm: 115 }] }).success).toBe(false);
  });

  it("拒绝未知的优速通套餐", () => {
    expect(UserProfileSchema.safeParse({ ...validProfile, llPackage: "vip99" }).success).toBe(false);
  });

  it("错误信息带字段路径，便于前端定位", () => {
    const r = UserProfileSchema.safeParse({ ...validProfile, kids: [{ age: 6, heightCm: 5 }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path.join(".")).toBe("kids.0.heightCm");
  });
});

describe("AgentBodySchema", () => {
  it("拒绝空消息", () => {
    expect(AgentBodySchema.safeParse({ message: "", sessionId: "s" }).success).toBe(false);
  });

  it("拒绝超长消息（挡住把接口当免费推理端点用）", () => {
    expect(AgentBodySchema.safeParse({ message: "啊".repeat(2001), sessionId: "s" }).success).toBe(false);
  });

  it("profile 可选——已有会话的后续轮次不必重传", () => {
    expect(AgentBodySchema.safeParse({ message: "你好", sessionId: "s" }).success).toBe(true);
  });
});

describe("查询参数", () => {
  it("waittimes 的 park / mode 有默认值", () => {
    const r = WaitTimesQuerySchema.parse({});
    expect(r.park).toBe("shanghai");
    expect(r.mode).toBe("live");
  });

  it("waittimes 拒绝未知 mode", () => {
    expect(WaitTimesQuerySchema.safeParse({ mode: "guess" }).success).toBe(false);
  });

  it("reviews 要求至少给一个 id", () => {
    expect(ReviewsQuerySchema.safeParse({}).success).toBe(false);
    expect(ReviewsQuerySchema.safeParse({ rideId: "tron" }).success).toBe(true);
    expect(ReviewsQuerySchema.safeParse({ restaurantId: "belle-castle" }).success).toBe(true);
  });
});
