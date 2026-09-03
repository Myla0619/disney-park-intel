/**
 * 项目评分服务
 *
 * 路由层（/api/recommend）与 Agent 的 plan_itinerary 工具共用同一份实现。
 * Claude 调用失败或返回非法 JSON 时降级到本地规则评分，调用方通过 fallback 字段感知。
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { UserProfile, Ride, RideScore, LiveWaitData, Review } from "@/types";
import { getRidesByPark } from "./parks-data";
import { isHeightBlocked, minKidHeightCm } from "./height";
import { getAnthropicClient } from "./anthropic-client";
import { SCORING_MODEL } from "./models";
import { logUsage } from "./usage-log";

export type ScoreRidesInput = {
  profile: UserProfile;
  waitTimes?: LiveWaitData[];
  reviews?: Record<string, Review[]>;
};

export type ScoreRidesResult = { scores: RideScore[]; fallback: boolean };

/**
 * 结构化输出 schema。交给 API 强制约束响应格式，模型无法返回缺字段或越界的评分，
 * 也就不再需要"剥 markdown 围栏 + JSON.parse + try/catch"那套脆弱的解析。
 */
const RideScoreSchema = z.object({
  rideId: z.string(),
  overallScore: z.number().min(0).max(100),
  waitScore: z.number().min(0).max(100),
  sentimentScore: z.number().min(0).max(100),
  profileMatchScore: z.number().min(0).max(100),
  reasoning: z.string(),
  recommended: z.boolean(),
  priority: z.enum(["must-do", "worth-it", "skip", "if-time"]),
});

const ScoresSchema = z.object({ scores: z.array(RideScoreSchema) });

export async function scoreRides({
  profile,
  waitTimes = [],
  reviews = {},
}: ScoreRidesInput): Promise<ScoreRidesResult> {
  const rides = getRidesByPark(profile.park);

  // 将实时等待时间合并到项目数据中
  const ridesWithWait = rides.map((ride) => {
    const live = waitTimes.find((w) => w.rideId === ride.id);
    return { ...ride, waitTime: live?.waitMinutes ?? ride.waitTime };
  });

  // 构建发给 Claude 的上下文字符串
  const rideContext = ridesWithWait
    .map(
      (r) =>
        `- ${r.name} | 区域: ${r.area} | 类型: ${r.type} | ` +
        `身高要求: ${r.heightRequirement ? r.heightRequirement + "cm" : "无"} | ` +
        `等待: ${r.waitTime != null ? r.waitTime + "分钟" : "演出/关闭"} | ` +
        `刺激度: ${r.thrillScore}/5 | 亲子: ${r.kidsScore}/5 | 标签: ${r.tags.join(", ")}`
    )
    .join("\n");

  const reviewContext = Object.entries(reviews)
    .map(([rideId, revs]) => {
      if (!revs.length) return "";
      const pos = revs.filter((r) => r.sentiment === "positive").length;
      const neg = revs.filter((r) => r.sentiment === "negative").length;
      const avgRating = (revs.reduce((a, b) => a + b.rating, 0) / revs.length).toFixed(1);
      const topTags = [...new Set(revs.flatMap((r) => r.tags))].slice(0, 4).join(", ");
      return `  ${rideId}: ${avgRating}★ 好评${pos}条/差评${neg}条, 标签: [${topTags}]`;
    })
    .filter(Boolean)
    .join("\n");

  const kids = profile.kids ?? [];
  const kidsInfo = kids.length
    ? `带有孩子，年龄与身高分别为: ${kids.map((k) => `${k.age}岁/${k.heightCm}cm`).join("、")}。` +
      `团队中最矮的孩子身高 ${minKidHeightCm(profile)}cm。`
    : "无孩子同行。";

  const prompt = `你是迪士尼乐园专家 AI。分析以下项目，并根据该游客的具体情况为每个项目打分。请用中文输出 reasoning 字段。

游客档案:
- 游玩模式: ${profile.mode}
  (family=带娃家庭优先亲子 / thrill=只玩刺激过山车 / casual=轻松不排长队 / photo=拍照打卡颜值优先 / shopping=购物美食体验优先)
- 刺激偏好: ${profile.thrillLevel}/5 (1=温和, 5=极刺激)
- ${kidsInfo}
- 游玩时间: ${profile.arrivalTime} — ${profile.departureTime}
- 行动需求: ${profile.mobilityNeeds ? "有行动不便成员" : "无限制"}

可选项目:
${rideContext}

用户评论情绪汇总:
${reviewContext || "暂无评论数据"}

任务: 为每个项目产出一条评分记录（评分字段均为 0-100，reasoning 用中文，1-2 句；
如有孩子需说明是否适合）。

评分规则:
- 若孩子因身高无法乘坐，priority 设为 "skip" 并在 reasoning 中说明原因
- 等待时间权重要高——90分钟的等待需要项目非常出色才能得高分
- "family" 模式: 提高无身高限制、kidsScore 高的项目得分
- "thrill" 模式: 即使等待较长，也优先推荐 thrillScore 高的项目
- "photo" 模式: 优先推荐有独特视觉体验/拍照场景丰富的项目、拍照场景丰富的项目（城堡、夜间烟花、主题区打卡点），刺激度权重降低
- "shopping" 模式: 优先推荐周边商品丰富、餐饮体验好、等待短的项目，刺激度几乎不计权
- "casual" 模式: 优先等待时间短、体验完整的经典项目
- 保持客观——普通项目应标记为 "if-time" 或 "skip"

为每个项目各产出一条评分。`;

  try {
    const message = await getAnthropicClient().messages.parse({
      model: SCORING_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: zodOutputFormat(ScoresSchema) },
      messages: [{ role: "user", content: prompt }],
    });

    logUsage("scoring", SCORING_MODEL, message.usage);

    const parsed = message.parsed_output;
    if (!parsed) throw new Error("结构化输出解析失败");
    return { scores: parsed.scores, fallback: false };
  } catch (err) {
    console.error("[scoring] Claude 调用失败，降级到本地规则评分:", err);
    return { scores: ridesWithWait.map((r) => generateFallbackScore(r, profile)), fallback: true };
  }
}

import { generateFallbackScore } from "./local-scoring";
export { generateFallbackScore };
