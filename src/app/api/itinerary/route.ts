import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/api/respond";
import { ItineraryBodySchema } from "@/lib/api/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "@/lib/anthropic-client";
import { ITINERARY_MODEL } from "@/lib/models";
import { logUsage } from "@/lib/usage-log";
import { isAnthropicConfigured } from "@/lib/anthropic-client";
import { UserProfile, RideScore, HistoricalWaitData, LiveWaitData } from "@/types";
import { getRidesByPark, getParkById } from "@/lib/parks-data";
import { buildRoute, buildAnchors, getParkHours, fillGaps } from "@/lib/routing";
import { nowMinutesInPark, todayInPark } from "@/lib/park-time";

const NotesSchema = z.object({
  notes: z.array(z.object({ itemId: z.string(), note: z.string() })),
});

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "itinerary", RATE_LIMITS.llm);
  if (limited.response) return limited.response;

  const parsed = await parseBody(req, ItineraryBodySchema);
  if (!parsed.ok) return parsed.response;

  const profile = parsed.data.profile as UserProfile;
  const scores = parsed.data.scores as RideScore[];
  const historicalWaits = parsed.data.historicalWaits as HistoricalWaitData[];
  const liveWaits = parsed.data.liveWaits as LiveWaitData[];
  const currentArea = parsed.data.currentArea;
  const polishNotes = parsed.data.polishNotes;
  const wishlist = parsed.data.wishlist;

  // 按园区时区判断"今天"，服务端时区不参与
  const isToday = profile.visitDate === todayInPark(profile.park);
  const nowMin = isToday ? nowMinutesInPark(profile.park) : undefined;
  const park = getParkById(profile.park);
  const rides = getRidesByPark(profile.park);

  // 营业时间
  const parkHours = await getParkHours(profile.park, profile.visitDate, isToday);

  // 锚点（花车/烟花）
  const anchors = buildAnchors(profile, parkHours, nowMin);

  // 起始区域
  const startArea = isToday && currentArea ? currentArea : "entrance";

  // 路径规划
  const routeParams = {
    rides, scores,
    historical: historicalWaits,
    live: isToday ? liveWaits : [],
    profile, startArea, parkHours, anchors, nowMin, wishlist,
  };

  const rawRoute = buildRoute(routeParams);
  const localRoute = fillGaps(rawRoute, profile);

  if (localRoute.length === 0) {
    return NextResponse.json({ itinerary: [], isToday, parkHours }, { headers: limited.headers });
  }

  // 不需要润色时直接返回确定性结果，不产生任何模型调用
  if (!polishNotes || !isAnthropicConfigured()) {
    return NextResponse.json(
      { itinerary: localRoute, isToday, parkHours, polished: false },
      { headers: limited.headers }
    );
  }

  // Claude 润色备注（不改时间顺序）
  const routeSummary = localRoute
    .filter((item) => item.type !== "walk")
    .map((item) => `${item.time}-${item.endTime} ${item.itemName}（${item.area}，等待${item.estimatedWait}分）`)
    .join("\n");

  const prompt = `你是迪士尼行程规划专家。为以下行程的每个项目写一句实用的中文备注，不超过40字。

模式：${{family:"带娃家庭",thrill:"刺激优先",casual:"轻松游览",photo:"拍照打卡",shopping:"购物美食"}[profile.mode]}
优速通：${profile.llPackage === "none" ? "未购买" : profile.llPackage}
日期：${profile.visitDate}（${isToday ? "今天实时数据" : "历史预测"}）

行程：
${routeSummary}

为行程中的每个项目各产出一条备注。`;

  try {
    const message = await getAnthropicClient().messages.parse({
      model: ITINERARY_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: zodOutputFormat(NotesSchema) },
      messages: [{ role: "user", content: prompt }],
    });
    logUsage("itinerary_notes", ITINERARY_MODEL, message.usage);

    const notes = message.parsed_output?.notes;
    if (!notes) throw new Error("结构化输出解析失败");
    const noteMap: Record<string,string> = {};
    notes.forEach((n) => { noteMap[n.itemId] = n.note; });

    const merged = localRoute.map((item) => ({
      ...item,
      note: noteMap[item.itemId] ?? item.note,
    }));
    return NextResponse.json({ itinerary:merged, isToday, parkHours }, { headers: limited.headers });
  } catch (err) {
    console.error("[itinerary] Claude 备注润色失败，返回未润色行程:", err);
    return NextResponse.json({ itinerary:localRoute, isToday, parkHours, fallback:true }, { headers: limited.headers });
  }
}
