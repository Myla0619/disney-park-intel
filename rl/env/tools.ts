/**
 * 工具注册表 + 实现
 *
 * 每个工具：name + description + input_schema（供 SFT/RL 的 system prompt 和
 * 训练框架读取）+ handler。所有 handler 返回 ToolResult 信封，失败也回传给模型。
 *
 * mode:
 *  - sandbox（默认）：排队/演出数据走录制回放（data/waittimes → fixtures 兜底），
 *    评论走本地语料，天气走确定性伪造。零外部依赖，可复现。
 *  - live：排队数据实调 themeparks.wiki / queue-times（带重试+超时+双源互备）。
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { LiveWaitData, Review, UserProfile, ItineraryItem } from "@/types";
import {
  getRidesByPark, getRideById, getPhotoSpots, getShopSpots, getRestaurants,
  getParkById, walkTime, estimateParkHours,
} from "@/lib/parks-data";
import { LL_PACKAGES } from "@/lib/ll-packages";
import { buildRoute, buildAnchors } from "@/lib/routing";
import { indexReviews, searchReviews } from "@/lib/vector-store";

import { type EnvMode, type ToolResult, toolOk, toolError, withRetry, withTimeout } from "./util";
import { getSnapshot } from "./sandbox";
import { normalizeThemeParksWiki, normalizeQueueTimes, extractShowtimes } from "./normalize";
import { scoreRides } from "./scorer";
import { checkItinerary } from "./constraints";

const HERE = dirname(fileURLToPath(import.meta.url));
const PARKS_CONFIG = JSON.parse(
  readFileSync(join(HERE, "..", "..", "scripts", "parks_config.json"), "utf-8")
) as { parks: { id: string; app_id: string; themeparks_wiki_entity: string; queue_times_park_id: number }[] };

const RIDE_REVIEW_FIXTURES = JSON.parse(
  readFileSync(join(HERE, "fixtures", "ride-reviews.json"), "utf-8")
) as Record<string, Review[]>;

export type ToolContext = { mode: EnvMode; snapshotAt?: string };

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: any, ctx: ToolContext) => Promise<ToolResult>;
};

// ─── 数据获取（live 双源互备 / sandbox 回放）─────────────────────────────────

function recorderIdFor(appParkId: string): string | null {
  return PARKS_CONFIG.parks.find((p) => p.app_id === appParkId)?.id ?? null;
}

async function fetchJson(url: string): Promise<any> {
  return withRetry(
    () =>
      withTimeout(
        fetch(url, { headers: { "User-Agent": "park-intel-env/1.0" } }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        15000,
        url
      ),
    2
  );
}

async function getLiveWaits(appParkId: string, ctx: ToolContext): Promise<LiveWaitData[]> {
  const recorderId = recorderIdFor(appParkId);

  if (ctx.mode === "sandbox") {
    if (!recorderId) throw new Error(`未配置的乐园: ${appParkId}`);
    const tpw = getSnapshot(recorderId, "themeparks_wiki", ctx.snapshotAt);
    if (tpw) return normalizeThemeParksWiki(tpw.data, appParkId);
    const qt = getSnapshot(recorderId, "queue_times", ctx.snapshotAt);
    if (qt) return normalizeQueueTimes(qt.data as any, appParkId);
    throw new Error("沙箱内无该乐园的排队快照（data/waittimes 为空且无夹具）");
  }

  // live：主源 themeparks.wiki，失败切 queue-times（双源互备）
  const park = getParkById(appParkId);
  const cfg = PARKS_CONFIG.parks.find((p) => p.app_id === appParkId);
  const entity = cfg?.themeparks_wiki_entity ?? park?.theparksApiId;
  if (!entity) throw new Error(`未配置的乐园: ${appParkId}`);
  try {
    const data = await fetchJson(`https://api.themeparks.wiki/v1/entity/${entity}/live`);
    return normalizeThemeParksWiki(data, appParkId);
  } catch (e) {
    const qtId = cfg?.queue_times_park_id ?? park?.queueTimesId;
    if (!qtId) throw e;
    const data = await fetchJson(`https://queue-times.com/parks/${qtId}/queue_times.json`);
    return normalizeQueueTimes(data, appParkId);
  }
}

// ─── 档案默认值（模型只需给增量字段）────────────────────────────────────────

function buildProfile(partial: Partial<UserProfile>, appParkId: string): UserProfile {
  return {
    mode: "casual", kids: [], thrillLevel: 3,
    arrivalTime: "09:00", departureTime: "21:30",
    mobilityNeeds: false, llPackage: "none",
    singlePassRides: [], bundle3Rides: [],
    watchParade: false, paradeTime: getParkById(appParkId)?.defaultParadeTime ?? "15:45",
    watchFireworks: false, fireworksTime: getParkById(appParkId)?.defaultFireworksTime ?? "21:00",
    visitDate: new Date().toISOString().slice(0, 10),
    park: appParkId, routeProfile: "balanced", diningPreference: "normal",
    focusPhoto: false, focusShopping: false, selectedRestaurants: [],
    ...partial,
  };
}

// ─── 工具定义 ────────────────────────────────────────────────────────────────

export const TOOLS: ToolDef[] = [
  {
    name: "get_wait_times",
    description: "获取乐园项目的当前等待时间。不传 ride_id 返回全园概况（最短/最长/平均）。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string", description: "乐园ID，如 shanghai" },
        ride_id: { type: "string", description: "项目ID，可选" },
      },
      required: ["park_id"],
    },
    handler: async (input, ctx) => {
      const waits = await getLiveWaits(input.park_id, ctx);
      const rides = getRidesByPark(input.park_id);
      if (input.ride_id) {
        const ride = rides.find((r) => r.id === input.ride_id);
        if (!ride) return toolError(`项目不存在: ${input.ride_id}`);
        const w = waits.find((x) => x.rideId === input.ride_id);
        return toolOk({
          rideName: ride.name,
          waitMinutes: w?.waitMinutes ?? null,
          status: w?.status ?? "unknown",
        });
      }
      const known = waits
        .map((w) => ({ ...w, name: rides.find((r) => r.id === w.rideId)?.name ?? w.rideId }))
        .filter((w) => w.waitMinutes !== null)
        .sort((a, b) => (a.waitMinutes ?? 0) - (b.waitMinutes ?? 0));
      if (!known.length) return toolError("暂无可用的等待时间数据");
      return toolOk({
        shortest: known.slice(0, 3).map((w) => ({ name: w.name, wait: w.waitMinutes })),
        longest: known.slice(-3).reverse().map((w) => ({ name: w.name, wait: w.waitMinutes })),
        average: Math.round(known.reduce((s, w) => s + (w.waitMinutes ?? 0), 0) / known.length),
        down: waits.filter((w) => w.status === "down").map((w) => w.rideId),
      });
    },
  },
  {
    name: "search_reviews",
    description: "RAG 语义检索项目或餐厅的用户评论，回答好不好玩/适不适合/值不值得类问题。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string" },
        target_id: { type: "string", description: "项目ID或餐厅ID" },
        target_type: { type: "string", enum: ["ride", "restaurant"] },
        query: { type: "string", description: "关心的问题，如'适合孩子吗'" },
        top_k: { type: "number", description: "返回条数，默认3" },
      },
      required: ["park_id", "target_id", "target_type", "query"],
    },
    handler: async (input) => {
      const { park_id, target_id, target_type, query, top_k = 3 } = input;
      let corpus: Review[] = [];
      if (target_type === "restaurant") {
        const rest = getRestaurants(park_id).find((r) => r.id === target_id);
        if (!rest) return toolError(`餐厅不存在: ${target_id}`);
        corpus = rest.reviews.map((r) => ({
          ...r, date: "", sentiment: r.rating >= 4 ? "positive" : r.rating >= 3 ? "neutral" : "negative",
        })) as Review[];
      } else {
        const ride = getRideById(target_id);
        if (!ride) return toolError(`项目不存在: ${target_id}`);
        corpus = RIDE_REVIEW_FIXTURES[target_id] ?? [];
      }
      if (!corpus.length) return toolError("该目标暂无评论数据");
      indexReviews(target_id, corpus);
      const hits = searchReviews(target_id, query, top_k);
      return toolOk({
        totalReviews: corpus.length,
        relevantReviews: hits.map((r) => ({
          source: r.source, rating: r.rating, text: r.text, tags: r.tags,
        })),
      });
    },
  },
  {
    name: "plan_itinerary",
    description: "根据游客档案生成整日行程（TSP 路径优化 + 花车/烟花锚点 + 用餐插入）。profile 只需传需要覆盖的字段。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string" },
        profile: { type: "object", description: "游客档案增量字段：mode/kids/arrivalTime/departureTime/llPackage/watchParade/watchFireworks 等" },
        start_area: { type: "string", description: "出发区域ID，默认 entrance" },
        avoid_rides: { type: "array", items: { type: "string" }, description: "排除的项目ID" },
      },
      required: ["park_id"],
    },
    handler: async (input, ctx) => {
      const profile = buildProfile(input.profile ?? {}, input.park_id);
      const rides = getRidesByPark(input.park_id);
      if (!rides.length) return toolError(`未知乐园: ${input.park_id}`);

      let live: LiveWaitData[] = [];
      try { live = await getLiveWaits(input.park_id, ctx); } catch { /* 无排队数据时退回静态估计 */ }

      let scores = scoreRides(rides, profile, live);
      const avoid: string[] = input.avoid_rides ?? [];
      if (avoid.length) {
        scores = scores.map((s) => avoid.includes(s.rideId) ? { ...s, priority: "skip" as const, recommended: false } : s);
      }

      const parkHours = estimateParkHours(profile.visitDate);
      const anchors = buildAnchors(profile, parkHours);
      const itinerary = buildRoute({
        rides, scores, historical: [], live, profile,
        startArea: input.start_area ?? "entrance", parkHours, anchors,
      });
      const constraint = checkItinerary(itinerary, profile);

      return toolOk({
        parkHours,
        totalItems: itinerary.length,
        constraintsPassed: constraint.passed,
        items: itinerary.map((i) => ({
          time: i.time, end: i.endTime, name: i.itemName, area: i.area,
          wait: i.estimatedWait, type: i.type, ll: i.llType ?? null,
        })),
      }, false);
    },
  },
  {
    name: "get_spot_info",
    description: "获取项目/拍照点/餐厅/商店的详情与步行时间。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string" },
        spot_id: { type: "string" },
        spot_type: { type: "string", enum: ["ride", "photo", "restaurant", "shop"] },
        current_area: { type: "string", description: "当前区域ID，用于计算步行时间" },
      },
      required: ["park_id", "spot_id", "spot_type"],
    },
    handler: async (input) => {
      const { park_id, spot_id, spot_type, current_area } = input;
      const mockProfile = { mobilityNeeds: false, kids: [] };
      const walk = (area: string) => (current_area ? walkTime(current_area, area, mockProfile) : null);

      if (spot_type === "ride") {
        const r = getRideById(spot_id);
        if (!r) return toolError(`项目不存在: ${spot_id}`);
        return toolOk({
          name: r.name, area: r.areaName, heightRequirement: r.heightRequirement,
          thrillScore: r.thrillScore, kidsScore: r.kidsScore, duration: r.rideDuration,
          llEligible: r.llEligible, singleRider: r.singleRider,
          walkMinutes: walk(r.area), description: r.description,
        });
      }
      if (spot_type === "photo") {
        const s = getPhotoSpots(park_id).find((x) => x.id === spot_id);
        if (!s) return toolError(`拍照点不存在: ${spot_id}`);
        return toolOk({
          name: s.name, area: s.areaName, bestTimeSlots: s.bestTimeSlots,
          bestConditions: s.bestConditions, tips: s.tips, walkMinutes: walk(s.area),
        });
      }
      if (spot_type === "restaurant") {
        const s = getRestaurants(park_id).find((x) => x.id === spot_id);
        if (!s) return toolError(`餐厅不存在: ${spot_id}`);
        return toolOk({
          name: s.name, area: s.areaName, type: s.type, cuisine: s.cuisine,
          priceRange: s.priceRange, rating: s.rating,
          requiresReservation: s.requiresReservation, reservationTips: s.reservationTips,
          tips: s.tips, walkMinutes: walk(s.area),
        });
      }
      if (spot_type === "shop") {
        const s = getShopSpots(park_id).find((x) => x.id === spot_id);
        if (!s) return toolError(`商店不存在: ${spot_id}`);
        return toolOk({
          name: s.name, area: s.areaName, theme: s.theme,
          hasLimitedEdition: s.hasLimitedEdition, bestTimeToVisit: s.bestTimeToVisit,
          tips: s.tips, walkMinutes: walk(s.area),
        });
      }
      return toolError(`未知地点类型: ${spot_type}`);
    },
  },
  {
    name: "get_show_schedule",
    description: "获取当日花车巡游/烟花等演出场次。",
    input_schema: {
      type: "object",
      properties: { park_id: { type: "string" } },
      required: ["park_id"],
    },
    handler: async (input, ctx) => {
      const park = getParkById(input.park_id);
      if (!park) return toolError(`未知乐园: ${input.park_id}`);
      const recorderId = recorderIdFor(input.park_id);
      if (recorderId) {
        const snap = getSnapshot(recorderId, "themeparks_wiki", ctx.snapshotAt);
        if (snap) {
          const shows = extractShowtimes(snap.data);
          if (shows.length) return toolOk({ shows, source: "snapshot" });
        }
      }
      return toolOk({
        shows: [
          { name: "花车巡游", startTimes: [park.defaultParadeTime] },
          { name: "烟花/幻影秀", startTimes: [park.defaultFireworksTime] },
        ],
        source: "default",
        note: "以官方App当日公布为准",
      });
    },
  },
  {
    name: "get_ll_pricing",
    description: "查询优速通（尊享卡/Priority Access）各档位价格、包含项目和权益。",
    input_schema: {
      type: "object",
      properties: { package_id: { type: "string", description: "套餐ID，可选；不传返回全部档位摘要" } },
      required: [],
    },
    handler: async (input) => {
      if (input.package_id) {
        const p = LL_PACKAGES.find((x) => x.id === input.package_id);
        if (!p) return toolError(`套餐不存在: ${input.package_id}`);
        return toolOk(p);
      }
      return toolOk(
        LL_PACKAGES.map((p) => ({
          id: p.id, name: p.name, price: p.price,
          rideCount: p.rides.length, unlimited: p.unlimited,
          reservedParade: p.hasReservedParade, reservedFireworks: p.hasReservedFireworks,
        }))
      );
    },
  },
  {
    name: "walk_time",
    description: "计算两个区域之间的步行时间（分钟）。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string" },
        from_area: { type: "string" },
        to_area: { type: "string" },
        mobility_needs: { type: "boolean", description: "行动不便（轮椅/婴儿车），默认 false" },
      },
      required: ["park_id", "from_area", "to_area"],
    },
    handler: async (input) => {
      const park = getParkById(input.park_id);
      if (!park) return toolError(`未知乐园: ${input.park_id}`);
      const valid = new Set(park.areas.map((a) => a.id));
      if (!valid.has(input.from_area)) return toolError(`未知区域: ${input.from_area}`);
      if (!valid.has(input.to_area)) return toolError(`未知区域: ${input.to_area}`);
      const minutes = walkTime(input.from_area, input.to_area, {
        mobilityNeeds: input.mobility_needs ?? false, kids: [],
      });
      return toolOk({ from: input.from_area, to: input.to_area, walkMinutes: minutes });
    },
  },
  {
    name: "check_constraints",
    description: "校验一份行程草案是否违反硬约束（时间连续性/孩子身高/离园时间/优速通90分钟间隔/入园时间），返回逐项结果。规划后建议自查。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string" },
        itinerary: {
          type: "array",
          description: "行程项数组，每项含 time/endTime/itemId/itemName/type，LL项目带 llType",
          items: { type: "object" },
        },
        profile: { type: "object", description: "游客档案增量字段（kids/arrivalTime/departureTime 等）" },
      },
      required: ["park_id", "itinerary"],
    },
    handler: async (input) => {
      const profile = buildProfile(input.profile ?? {}, input.park_id);
      const result = checkItinerary((input.itinerary ?? []) as ItineraryItem[], profile);
      return toolOk(result);
    },
  },
  {
    name: "get_weather",
    description: "获取乐园所在城市的天气（影响户外项目、漂流和烟花）。",
    input_schema: {
      type: "object",
      properties: {
        park_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD，默认今天" },
      },
      required: ["park_id"],
    },
    handler: async (input, ctx) => {
      const park = getParkById(input.park_id);
      if (!park) return toolError(`未知乐园: ${input.park_id}`);
      const date = input.date ?? new Date().toISOString().slice(0, 10);

      if (ctx.mode === "sandbox") {
        // 由日期哈希生成确定性伪天气：同一天永远同一结果，rollout 可复现
        const hash = [...date].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
        const conditions = ["晴", "多云", "阴", "小雨", "雷阵雨"] as const;
        const cond = conditions[hash % conditions.length];
        return toolOk({
          city: park.city, date, condition: cond,
          tempC: 18 + (hash % 15), rainProbability: cond.includes("雨") ? 60 + (hash % 30) : hash % 30,
          note: cond.includes("雨") ? "雨天户外项目可能临时关闭，烟花可能取消，建议携带雨具" : "适合游玩",
          source: "sandbox-deterministic",
        });
      }
      // live 模式需要和风/OpenWeather key，后续接入
      return toolError("live 天气未配置 API key（设置 QWEATHER_KEY 后启用），可先用 sandbox 模式");
    },
  },
];

export const TOOL_REGISTRY = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export async function callTool(name: string, input: any, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return toolError(`未知工具: ${name}。可用工具: ${TOOLS.map((t) => t.name).join(", ")}`);
  try {
    return await tool.handler(input ?? {}, ctx);
  } catch (e: any) {
    // 异常日志回传给模型（失败感知），不抛 500
    return toolError(`工具执行失败: ${e?.message ?? String(e)}`);
  }
}
