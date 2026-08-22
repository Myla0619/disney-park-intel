/**
 * API 入参校验
 *
 * 路由此前直接 `await req.json()` 后当作可信数据用：畸形的 profile 会一路穿到
 * 路径规划里，表现为 NaN 时间或空行程，而不是一条明确的 400。这里在边界上一次性
 * 校验，错误信息带字段路径。
 */

import { z } from "zod";

const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:MM");

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

export const KidInfoSchema = z.object({
  age: z.number().int().min(0).max(17),
  // 上海迪士尼最高身高限制 140cm，上界留足冗余即可
  heightCm: z.number().min(40).max(220),
});

export const LLPackageSchema = z.enum([
  "none", "single", "bundle3",
  "bundle6-kids", "bundle6-adv", "bundle6-fun", "bundle8",
  "premium9", "premium13", "concierge11", "vip33",
]);

export const UserProfileSchema = z.object({
  mode: z.enum(["family", "thrill", "casual", "photo", "shopping"]),
  kids: z.array(KidInfoSchema).max(10).default([]),
  thrillLevel: z.number().int().min(1).max(5),
  arrivalTime: HHMM,
  departureTime: HHMM,
  mobilityNeeds: z.boolean().default(false),
  llPackage: LLPackageSchema,
  singlePassRides: z.array(z.string()).default([]),
  bundle3Rides: z.array(z.string()).default([]),
  watchParade: z.boolean().default(false),
  paradeTime: HHMM.default("15:45"),
  watchFireworks: z.boolean().default(false),
  fireworksTime: HHMM.default("21:00"),
  visitDate: ISO_DATE,
  park: z.string().min(1),
  routeProfile: z.enum(["efficient", "balanced", "easy"]).default("balanced"),
  diningPreference: z.enum(["quick", "normal", "fancy"]).default("normal"),
  focusPhoto: z.boolean().default(false),
  focusShopping: z.boolean().default(false),
  selectedRestaurants: z.array(z.string()).default([]),
});

export const RideScoreSchema = z.object({
  rideId: z.string(),
  overallScore: z.number(),
  waitScore: z.number(),
  sentimentScore: z.number(),
  profileMatchScore: z.number(),
  reasoning: z.string(),
  recommended: z.boolean(),
  priority: z.enum(["must-do", "worth-it", "skip", "if-time"]),
});

export const LiveWaitSchema = z.object({
  rideId: z.string(),
  waitMinutes: z.number().nullable(),
  status: z.enum(["operating", "down", "closed", "refurbishment"]),
  lastUpdated: z.string(),
});

export const HistoricalWaitSchema = z.object({
  rideId: z.string(),
  predictedWait: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  basis: z.string(),
});

// ─── 各路由的请求体 ───────────────────────────────────────────────────────────

export const RecommendBodySchema = z.object({
  profile: UserProfileSchema,
  waitTimes: z.array(LiveWaitSchema).default([]),
  reviews: z.record(z.string(), z.array(z.any())).default({}),
});

export const ItineraryBodySchema = z.object({
  profile: UserProfileSchema,
  scores: z.array(RideScoreSchema).default([]),
  historicalWaits: z.array(HistoricalWaitSchema).default([]),
  liveWaits: z.array(LiveWaitSchema).default([]),
  currentArea: z.string().optional(),
  /**
   * 是否让 Claude 润色每项备注。默认开启；置 false 时只跑确定性的路径规划。
   * 约束评测要跑 100 个场景，逐个调模型既慢又花钱，而它校验的是排程约束，
   * 与备注文案无关。
   */
  polishNotes: z.boolean().default(true),
});

export const AgentBodySchema = z.object({
  // 上限防止单条消息把上下文顶爆，也挡住把接口当免费推理端点刷的用法
  message: z.string().min(1, "message 不能为空").max(2000, "单条消息不超过 2000 字"),
  sessionId: z.string().min(1).max(128),
  profile: UserProfileSchema.optional(),
});

export const WaitTimesQuerySchema = z.object({
  park: z.string().min(1).default("shanghai"),
  mode: z.enum(["live", "historical"]).default("live"),
  date: ISO_DATE.optional(),
});

export const ReviewsQuerySchema = z
  .object({
    rideId: z.string().min(1).optional(),
    restaurantId: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.rideId || v.restaurantId), {
    message: "rideId 或 restaurantId 至少提供一个",
  });
