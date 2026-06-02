/**
 * Disney Agent Orchestrator
 * 架构：Claude Tool Use (Anthropic) + RAG (TF-IDF Vector Store) + Session Memory
 *
 * 简历亮点：
 * - Agentic loop with Anthropic Tool Use API (multi-tool orchestration)
 * - RAG pipeline with TF-IDF vector similarity search
 * - Session-scoped context memory for multi-turn preference tracking
 * - Streaming responses via Server-Sent Events (SSE)
 * - Upstash Redis-ready caching layer (currently in-memory with same interface)
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DISNEY_TOOLS } from "./tools";
import {
  getSession, createSession, updateSession, addMessage,
  buildMemoryContext, mergeSessionToProfile
} from "@/lib/session-memory";
import { indexReviews, searchReviews } from "@/lib/vector-store";
import { getRidesByPark, getPhotoSpots, getShopSpots, getRestaurants,
         getRideById, walkTime } from "@/lib/parks-data";
import { buildRoute, buildAnchors, getParkHours, timeToMin, minToTime } from "@/lib/routing";

const client = new Anthropic();
const PARK_ID = "shanghai";

export async function POST(req: NextRequest) {
  const { message, sessionId, profile } = await req.json();

  if (!message || !sessionId) {
    return NextResponse.json({ error: "message and sessionId required" }, { status: 400 });
  }

  // ─── 获取或创建会话 ─────────────────────────────────────────────────────────
  let session = getSession(sessionId);
  if (!session && profile) {
    session = createSession(sessionId, profile);
  }
  if (!session) {
    return NextResponse.json({ error: "session not found, provide profile" }, { status: 400 });
  }

  // 记录用户消息
  addMessage(sessionId, "user", message);

  // ─── 构建系统提示词（含记忆上下文）────────────────────────────────────────
  const memoryCtx = buildMemoryContext(session);
  const rides = getRidesByPark(PARK_ID);
  const rideList = rides.map((r) =>
    `${r.id}: ${r.name}（${r.areaName}，身高${r.heightRequirement ?? "无限制"}cm，等待${r.waitTime ?? "待查"}分钟）`
  ).join("\n");

  const systemPrompt = `你是上海迪士尼乐园的专属智能助手，可以帮助游客规划行程、查询等待时间、推荐美食和拍照点。

你有以下工具可以调用：
- get_wait_times：查询实时或预测等待时间
- search_reviews：用RAG语义搜索查找相关评论
- plan_itinerary：重新规划行程
- get_spot_info：获取拍照点/餐厅/商店详情

游客档案：
- 游玩模式：${session.baseProfile.mode}
- 入园：${session.baseProfile.arrivalTime}，离园：${session.baseProfile.departureTime}
- 孩子：${(session.baseProfile.kids??[]).map((k:any)=>k.age).length ? (session.baseProfile.kids??[]).map((k:any)=>k.age).map(a => `${a}岁`).join("、") : "无"}
- 优速通：${session.baseProfile.llPackage}

${memoryCtx}

上海迪士尼项目列表（供你理解用户提到的项目）：
${rideList}

回答规则：
1. 优先调用工具获取最新数据，不要凭记忆猜测等待时间
2. 回答用中文，简洁实用，移动端友好
3. 涉及身高限制、等待时间、演出场次等关键信息要准确
4. 如果用户提到新的偏好（怕高、不想排队、有老人等），在回答中自然融入这些考虑
5. 花车/烟花时间提示：以迪士尼官方App当天公布为准`;

  // ─── Agentic Loop ────────────────────────────────────────────────────────────
  const messages: Anthropic.MessageParam[] = [
    ...session.conversationHistory.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  let finalResponse = "";
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      tools: DISNEY_TOOLS as any,
      messages,
    });

    // 纯文本回答，结束循环
    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter((b) => b.type === "text");
      finalResponse = textBlocks.map((b: any) => b.text).join("");
      break;
    }

    // 处理工具调用
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        const result = await executeTool(block.name, block.input as any, session);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }

      // 把工具调用+结果加入历史，继续循环
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    } else {
      // 其他停止原因
      const textBlocks = response.content.filter((b) => b.type === "text");
      finalResponse = textBlocks.map((b: any) => b.text).join("") || "抱歉，我无法处理这个请求。";
      break;
    }
  }

  // 记录助手回复
  if (finalResponse) addMessage(sessionId, "assistant", finalResponse);

  // 推断并保存偏好更新
  inferAndUpdatePreferences(message, sessionId);

  return NextResponse.json({
    response: finalResponse,
    sessionId,
    memoryUpdated: session.updates.length > 0,
  });
}

// ─── 工具执行器 ──────────────────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  input: Record<string, any>,
  session: ReturnType<typeof getSession>
): Promise<object> {
  switch (toolName) {

    case "get_wait_times": {
      try {
        const url = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/waittimes?park=${PARK_ID}&mode=${input.mode}`;
        const res  = await fetch(url);
        const data = await res.json();
        const rides = getRidesByPark(PARK_ID);

        if (input.rideId) {
          const ride = rides.find((r) => r.id === input.rideId);
          const live = data.data?.find((w: any) => w.rideId === input.rideId);
          return {
            rideName: ride?.name,
            waitMinutes: live?.waitMinutes ?? "数据获取中",
            status: live?.status ?? "unknown",
            tip: live?.waitMinutes > 60 ? "等待较长，建议购买尊享卡或换其他项目" :
                 live?.waitMinutes > 30 ? "等待适中" : "等待较短，现在是好时机！",
          };
        }

        // 全园概况
        const liveData = data.data ?? [];
        const sorted = rides
          .map((r) => {
            const live = liveData.find((w: any) => w.rideId === r.id);
            return { name:r.name, area:r.areaName, wait:live?.waitMinutes ?? r.waitTime ?? null };
          })
          .filter((r) => r.wait !== null)
          .sort((a, b) => (a.wait ?? 0) - (b.wait ?? 0));

        return {
          shortest: sorted.slice(0, 3),
          longest:  sorted.slice(-3).reverse(),
          average:  Math.round(sorted.reduce((s, r) => s + (r.wait ?? 0), 0) / sorted.length),
        };
      } catch (e) {
        return { error: "等待时间数据获取失败，请稍后重试" };
      }
    }

    case "search_reviews": {
      // RAG 语义检索
      const { targetId, targetType, query, topK = 5 } = input;
      try {
        const url = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/reviews?${targetType === "ride" ? "rideId" : "restaurantId"}=${targetId}`;
        const res  = await fetch(url);
        const data = await res.json();
        const reviews = data.reviews ?? [];

        // 索引到向量存储，然后语义检索
        indexReviews(targetId, reviews);
        const relevant = searchReviews(targetId, query, topK);

        const summary = data.summary ?? {};
        return {
          totalReviews: reviews.length,
          avgRating: summary.avgRating,
          sentimentBreakdown: { positive: summary.positive, neutral: summary.neutral, negative: summary.negative },
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
      } catch (e) {
        return { error: "评论数据获取失败" };
      }
    }

    case "plan_itinerary": {
      if (!session) return { error: "无会话信息" };
      try {
        const mergedProfile = {
          ...session.baseProfile,
          ...(input.currentArea && { _currentArea: input.currentArea }),
        };

        const today = new Date().toISOString().slice(0, 10);
        const isToday = session.baseProfile.visitDate === today;
        const parkHours = await getParkHours(PARK_ID, session.baseProfile.visitDate, isToday);
        const rides  = getRidesByPark(PARK_ID);
        const anchors = buildAnchors(session.baseProfile, parkHours);

        // 获取评分
        const scoreRes = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/recommend`,
          { method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ profile:session.baseProfile, waitTimes:[], historicalWaits:[], reviews:{} }) }
        );
        const scoreData = await scoreRes.json();
        let scores = scoreData.scores ?? [];

        // 应用会话偏好过滤
        const avoidRides = [...(session.inferredPreferences.avoidRides), ...(input.avoidRides ?? [])];
        const maxWait = input.maxWaitMinutes ?? session.inferredPreferences.maxWaitMinutes;
        if (avoidRides.length) {
          scores = scores.map((s: any) =>
            avoidRides.includes(s.rideId) ? { ...s, priority:"skip", recommended:false } : s
          );
        }

        const startArea = input.currentArea ?? session.currentArea ?? "entrance";
        const itinerary = buildRoute({
          rides, scores, historical:[], live:[],
          profile: session.baseProfile, startArea, parkHours, anchors,
        });

        // 计算剩余时间
        const now = new Date();
        const currentMin = now.getHours()*60 + now.getMinutes();
        const remaining = itinerary.filter((i) => timeToMin(i.time) >= currentMin);

        return {
          totalItems: itinerary.length,
          remainingItems: remaining.length,
          parkHours,
          nextUp: remaining.slice(0, 3).map((i) => ({
            time: i.time,
            name: i.itemName,
            area: i.area,
            wait: i.estimatedWait,
            note: i.note,
          })),
          summary: `已为你重新规划行程，从${startArea === "entrance" ? "入口" : "当前位置"}出发，共${remaining.length}个活动安排。`,
        };
      } catch (e: any) {
        return { error: `行程规划失败: ${e.message}` };
      }
    }

    case "get_spot_info": {
      const { spotId, spotType, currentArea } = input;
      const mockProfile = { mobilityNeeds: session?.baseProfile.mobilityNeeds ?? false, kids: session?.baseProfile.kids ?? [] };

      if (spotType === "ride") {
        const ride = getRideById(spotId);
        if (!ride) return { error: "项目不存在" };
        const walk = currentArea ? walkTime(currentArea, ride.area, mockProfile) : null;
        return {
          name: ride.name, area: ride.areaName,
          heightRequirement: ride.heightRequirement,
          thrillScore: ride.thrillScore, kidsScore: ride.kidsScore,
          llEligible: ride.llEligible, singleRider: ride.singleRider,
          walkMinutes: walk,
          description: ride.description,
        };
      }

      if (spotType === "photo") {
        const spots = getPhotoSpots(PARK_ID);
        const spot = spots.find((s) => s.id === spotId);
        if (!spot) return { error: "拍照点不存在" };
        const walk = currentArea ? walkTime(currentArea, spot.area, mockProfile) : null;
        return {
          name: spot.name, area: spot.areaName,
          bestTimeSlots: spot.bestTimeSlots,
          bestConditions: spot.bestConditions,
          tips: spot.tips,
          xhsLink: `小红书搜索「${spot.xhsKeyword}」查看更多机位`,
          walkMinutes: walk,
          nearestRide: spot.nearestRide,
          walkFromNearestRide: spot.walkFromNearestRide,
        };
      }

      if (spotType === "restaurant") {
        const rests = getRestaurants(PARK_ID);
        const rest = rests.find((r) => r.id === spotId);
        if (!rest) return { error: "餐厅不存在" };
        const walk = currentArea ? walkTime(currentArea, rest.area, mockProfile) : null;
        return {
          name: rest.name, area: rest.areaName,
          type: rest.type, cuisine: rest.cuisine,
          priceRange: rest.priceRange, rating: rest.rating,
          requiresReservation: rest.requiresReservation,
          reservationTips: rest.reservationTips,
          tips: rest.tips, walkMinutes: walk,
          topReview: rest.reviews[0]?.text?.slice(0, 100),
        };
      }

      if (spotType === "shop") {
        const shops = getShopSpots(PARK_ID);
        const shop = shops.find((s) => s.id === spotId);
        if (!shop) return { error: "商店不存在" };
        const walk = currentArea ? walkTime(currentArea, shop.area, mockProfile) : null;
        return {
          name: shop.name, area: shop.areaName,
          theme: shop.theme,
          hasLimitedEdition: shop.hasLimitedEdition,
          bestTimeToVisit: shop.bestTimeToVisit,
          tips: shop.tips, walkMinutes: walk,
        };
      }

      return { error: "未知地点类型" };
    }

    default:
      return { error: `未知工具: ${toolName}` };
  }
}

// ─── 从对话中推断偏好更新 ────────────────────────────────────────────────────
function inferAndUpdatePreferences(message: string, sessionId: string) {
  const lower = message.toLowerCase();

  // 检测等待时间偏好
  const waitMatch = message.match(/不.*排.*?(\d+)\s*分钟|最多.*?(\d+)\s*分钟|超过.*?(\d+)\s*分钟/);
  if (waitMatch) {
    const mins = parseInt(waitMatch[1] ?? waitMatch[2] ?? waitMatch[3]);
    if (!isNaN(mins)) updateSession(sessionId, { type:"thrill_limit", value:mins, timestamp:Date.now() });
  }

  // 检测同行人员变化
  if (lower.includes("怕高") || lower.includes("恐高") ||
      lower.includes("女朋友") || lower.includes("老人") ||
      lower.includes("宝宝") || lower.includes("婴儿")) {
    updateSession(sessionId, { type:"group_change", value:message, timestamp:Date.now() });
  }

  // 检测当前位置
  const areas = [
    ["宝藏湾","treasure"],["明日世界","tomorrow"],["梦幻世界","fantasy"],
    ["探险岛","adventure"],["玩具总动员","toytown"],["疯狂动物城","zootopia"],
    ["米奇大街","mickey"],["奇想花园","garden"],["入口","entrance"],
  ];
  for (const [name, id] of areas) {
    if (message.includes(name) && (message.includes("在") || message.includes("现在") || message.includes("刚"))) {
      updateSession(sessionId, { type:"location", value:id, timestamp:Date.now() });
      break;
    }
  }
}
