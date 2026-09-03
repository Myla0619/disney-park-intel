/**
 * Agent 工具执行器
 *
 * 这些工具直接调用 src/lib 下的服务函数，而不是回头 fetch 本应用的 HTTP 接口。
 * 自调用 HTTP 有三个问题：依赖 NEXT_PUBLIC_BASE_URL（Serverless 上没配就打到
 * localhost 而整条工具链失败）、每次工具调用多一个网络往返、错误在 HTTP 边界上
 * 丢失堆栈。
 */

import {
  getRidesByPark, getPhotoSpots, getShopSpots, getRestaurants,
  getRideById, walkTime,
} from "@/lib/parks-data";
import { getLiveWaitTimes, getPredictedWaitTimes } from "@/lib/wait-times";
import { getReviews } from "@/lib/reviews";
import { scoreRides } from "@/lib/scoring";
import { indexReviews, searchReviews } from "@/lib/vector-store";
import { buildRoute, buildAnchors, getParkHours, timeToMin } from "@/lib/routing";
import { nowMinutesInPark, todayInPark } from "@/lib/park-time";
import { SessionMemory } from "@/lib/session-memory";

const PARK_ID = "shanghai";

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  session: SessionMemory
): Promise<object> {
  switch (toolName) {
    case "get_wait_times":
      return getWaitTimesTool(input);
    case "search_reviews":
      return searchReviewsTool(input);
    case "plan_itinerary":
      return planItineraryTool(input, session);
    case "get_spot_info":
      return getSpotInfoTool(input, session);
    default:
      return { error: `未知工具: ${toolName}` };
  }
}

// ─── get_wait_times ──────────────────────────────────────────────────────────
async function getWaitTimesTool(input: Record<string, any>) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result =
      input.mode === "historical"
        ? await getPredictedWaitTimes(PARK_ID, today)
        : await getLiveWaitTimes(PARK_ID);

    const rides = getRidesByPark(PARK_ID);
    const waitOf = (rideId: string): number | null => {
      const entry: any = result.data.find((w: any) => w.rideId === rideId);
      if (!entry) return null;
      return entry.waitMinutes ?? entry.predictedWait ?? null;
    };

    if (input.rideId) {
      const ride = rides.find((r) => r.id === input.rideId);
      if (!ride) return { error: `未知项目: ${input.rideId}` };
      const wait = waitOf(input.rideId);
      const entry: any = result.data.find((w: any) => w.rideId === input.rideId);
      return {
        rideName: ride.name,
        waitMinutes: wait ?? "暂无数据",
        status: entry?.status ?? "unknown",
        isFallbackData: result.fallback,
        tip:
          wait == null ? "该项目暂无排队数据，到场后以官方 App 为准"
          : wait > 60 ? "等待较长，建议购买尊享卡或改玩其他项目"
          : wait > 30 ? "等待适中"
          : "等待较短，现在是好时机",
      };
    }

    const sorted = rides
      .map((r) => ({ name: r.name, area: r.areaName, wait: waitOf(r.id) ?? r.waitTime }))
      .filter((r): r is { name: string; area: string; wait: number } => r.wait != null)
      .sort((a, b) => a.wait - b.wait);

    if (!sorted.length) return { error: "当前没有可用的排队数据" };

    return {
      shortest: sorted.slice(0, 3),
      longest: sorted.slice(-3).reverse(),
      average: Math.round(sorted.reduce((s, r) => s + r.wait, 0) / sorted.length),
      isFallbackData: result.fallback,
    };
  } catch (err: any) {
    return { error: `等待时间数据获取失败: ${err.message}` };
  }
}

// ─── search_reviews（RAG）────────────────────────────────────────────────────
async function searchReviewsTool(input: Record<string, any>) {
  const { targetId, targetType, query, topK = 5 } = input;
  try {
    const { reviews, summary, fallback } = await getReviews(targetId, targetType);
    if (!reviews.length) return { error: `没有找到 ${targetId} 的评论` };

    indexReviews(targetId, reviews);
    const relevant = searchReviews(targetId, query, topK);

    return {
      totalReviews: reviews.length,
      avgRating: summary.avgRating,
      sentimentBreakdown: {
        positive: summary.positive,
        neutral: summary.neutral,
        negative: summary.negative,
      },
      isSampleData: fallback,
      relevantReviews: relevant.map((r) => ({
        source: r.source,
        author: r.author,
        rating: r.rating,
        text: r.text.slice(0, 150),
        tags: r.tags,
        relevanceScore: (r as any).score?.toFixed(3),
      })),
      queryContext: query,
    };
  } catch (err: any) {
    return { error: `评论检索失败: ${err.message}` };
  }
}

// ─── plan_itinerary ──────────────────────────────────────────────────────────
async function planItineraryTool(input: Record<string, any>, session: SessionMemory) {
  try {
    const profile = session.baseProfile;
    const isToday = profile.visitDate === todayInPark(PARK_ID);
    const nowMin = isToday ? nowMinutesInPark(PARK_ID) : undefined;

    const [parkHours, live, predicted] = await Promise.all([
      getParkHours(PARK_ID, profile.visitDate, isToday),
      isToday ? getLiveWaitTimes(PARK_ID) : Promise.resolve(null),
      getPredictedWaitTimes(PARK_ID, profile.visitDate),
    ]);

    const { scores: rawScores } = await scoreRides({
      profile,
      waitTimes: live?.data ?? [],
    });

    // 叠加会话中推断出的偏好：对话里说过"不想玩 X"要在重规划时生效
    const avoidRides = [
      ...session.inferredPreferences.avoidRides,
      ...(input.avoidRides ?? []),
    ];
    const mustRides = [
      ...session.inferredPreferences.mustRides,
      ...(input.mustRides ?? []),
    ];
    const maxWait = input.maxWaitMinutes ?? session.inferredPreferences.maxWaitMinutes;

    let scores = rawScores;
    if (avoidRides.length) {
      scores = scores.map((s) =>
        avoidRides.includes(s.rideId) ? { ...s, priority: "skip" as const, recommended: false } : s
      );
    }
    if (mustRides.length) {
      scores = scores.map((s) =>
        mustRides.includes(s.rideId) ? { ...s, priority: "must-do" as const, recommended: true } : s
      );
    }

    const startArea = input.currentArea ?? session.currentArea ?? "entrance";
    const itinerary = buildRoute({
      rides: getRidesByPark(PARK_ID),
      scores,
      historical: predicted.data,
      live: live?.data ?? [],
      profile,
      startArea,
      parkHours,
      anchors: buildAnchors(profile, parkHours, nowMin),
      nowMin,
    });

    // maxWait 是会话级软约束：超时项目从"接下来"里剔除，但不改动已排定的锚点
    const currentMin = nowMinutesInPark(PARK_ID);
    const remaining = itinerary
      .filter((i) => timeToMin(i.time) >= currentMin)
      .filter((i) => maxWait == null || i.estimatedWait <= maxWait);

    return {
      totalItems: itinerary.length,
      remainingItems: remaining.length,
      parkHours,
      appliedConstraints: {
        avoidRides: avoidRides.length ? avoidRides : undefined,
        mustRides: mustRides.length ? mustRides : undefined,
        maxWaitMinutes: maxWait,
      },
      nextUp: remaining.slice(0, 3).map((i) => ({
        time: i.time,
        name: i.itemName,
        area: i.area,
        wait: i.estimatedWait,
        note: i.note,
      })),
    };
  } catch (err: any) {
    return { error: `行程规划失败: ${err.message}` };
  }
}

// ─── get_spot_info ───────────────────────────────────────────────────────────
function getSpotInfoTool(input: Record<string, any>, session: SessionMemory) {
  const { spotId, spotType, currentArea } = input;
  const profile = {
    mobilityNeeds: session.baseProfile.mobilityNeeds ?? false,
    kids: session.baseProfile.kids ?? [],
  };
  const walkTo = (area: string) => (currentArea ? walkTime(currentArea, area, profile) : null);

  switch (spotType) {
    case "ride": {
      const ride = getRideById(spotId);
      if (!ride) return { error: `项目不存在: ${spotId}` };
      return {
        name: ride.name, area: ride.areaName,
        heightRequirement: ride.heightRequirement,
        thrillScore: ride.thrillScore, kidsScore: ride.kidsScore,
        llEligible: ride.llEligible, singleRider: ride.singleRider,
        walkMinutes: walkTo(ride.area),
        description: ride.description,
      };
    }
    case "photo": {
      const spot = getPhotoSpots(PARK_ID).find((s) => s.id === spotId);
      if (!spot) return { error: `拍照点不存在: ${spotId}` };
      return {
        name: spot.name, area: spot.areaName,
        bestTimeSlots: spot.bestTimeSlots,
        bestConditions: spot.bestConditions,
        tips: spot.tips,
        xhsLink: `小红书搜索「${spot.xhsKeyword}」查看更多机位`,
        walkMinutes: walkTo(spot.area),
        nearestRide: spot.nearestRide,
        walkFromNearestRide: spot.walkFromNearestRide,
      };
    }
    case "restaurant": {
      const rest = getRestaurants(PARK_ID).find((r) => r.id === spotId);
      if (!rest) return { error: `餐厅不存在: ${spotId}` };
      return {
        name: rest.name, area: rest.areaName,
        type: rest.type, cuisine: rest.cuisine,
        priceRange: rest.priceRange, rating: rest.rating,
        requiresReservation: rest.requiresReservation,
        reservationTips: rest.reservationTips,
        tips: rest.tips, walkMinutes: walkTo(rest.area),
        topReview: rest.reviews[0]?.text?.slice(0, 100),
      };
    }
    case "shop": {
      const shop = getShopSpots(PARK_ID).find((s) => s.id === spotId);
      if (!shop) return { error: `商店不存在: ${spotId}` };
      return {
        name: shop.name, area: shop.areaName,
        theme: shop.theme,
        hasLimitedEdition: shop.hasLimitedEdition,
        bestTimeToVisit: shop.bestTimeToVisit,
        tips: shop.tips, walkMinutes: walkTo(shop.area),
      };
    }
    default:
      return { error: `未知地点类型: ${spotType}` };
  }
}
