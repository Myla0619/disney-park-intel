import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { UserProfile, Ride, RideScore, LiveWaitData, Review } from "@/types";
import { getRidesByPark } from "@/lib/parks-data";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { profile, waitTimes, reviews } = body as {
    profile: UserProfile;
    waitTimes: LiveWaitData[];
    reviews: Record<string, Review[]>;
  };

  if (!profile) {
    return NextResponse.json({ error: "profile required" }, { status: 400 });
  }

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

  const kidsInfo =
    (profile.kids??[]).map((k:any)=>k.age).length > 0
      ? `带有孩子，年龄分别为: ${(profile.kids??[]).map((k:any)=>k.age).join(", ")}岁。预估身高约: ${(profile.kids??[]).map((k:any)=>k.age).map((a) => Math.min(70 + a * 6, 160)).join(", ")}cm。`
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

任务: 为每个项目打分，返回 JSON 数组，每条格式如下:
{
  "rideId": string,
  "overallScore": number (0-100 综合评分),
  "waitScore": number (0-100，等待越短或越值得等分越高),
  "sentimentScore": number (0-100，来自用户评论),
  "profileMatchScore": number (0-100，与该游客档案的匹配度),
  "reasoning": string (1-2句中文说明，如有孩子需提及是否适合),
  "recommended": boolean,
  "priority": "must-do" | "worth-it" | "skip" | "if-time"
}

评分规则:
- 若孩子因身高无法乘坐，priority 设为 "skip" 并在 reasoning 中说明原因
- 等待时间权重要高——90分钟的等待需要项目非常出色才能得高分
- "family" 模式: 提高无身高限制、kidsScore 高的项目得分
- "thrill" 模式: 即使等待较长，也优先推荐 thrillScore 高的项目
- "photo" 模式: 优先推荐有独特视觉体验/拍照场景丰富的项目、拍照场景丰富的项目（城堡、夜间烟花、主题区打卡点），刺激度权重降低
- "shopping" 模式: 优先推荐周边商品丰富、餐饮体验好、等待短的项目，刺激度几乎不计权
- "casual" 模式: 优先等待时间短、体验完整的经典项目
- 保持客观——普通项目应标记为 "if-time" 或 "skip"

只返回 JSON 数组，不要 markdown 格式，不要任何解释文字。`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as any).text.trim();
    const scores: RideScore[] = JSON.parse(raw);
    return NextResponse.json({ scores });
  } catch (err: any) {
    console.error("Claude API 错误:", err);
    // 降级方案：不调用 AI，直接生成基础评分
    const fallback = ridesWithWait.map((r) => generateFallbackScore(r, profile));
    return NextResponse.json({ scores: fallback, fallback: true });
  }
}

function generateFallbackScore(ride: Ride, profile: UserProfile): RideScore {
  const kidsMinHeight = (profile.kids??[]).map((k:any)=>k.age).length
    ? Math.min(...(profile.kids??[]).map((k:any)=>k.age).map((a) => Math.min(70 + a * 6, 160)))
    : 200;

  const heightBlocked =
    ride.heightRequirement != null &&
    (profile.kids??[]).map((k:any)=>k.age).length > 0 &&
    kidsMinHeight < ride.heightRequirement;

  const waitScore = ride.waitTime == null ? 50 : Math.max(0, 100 - ride.waitTime);
  const thrillMatch =
    profile.mode === "thrill"
      ? ride.thrillScore * 20
      : profile.mode === "family"
      ? ride.kidsScore * 20
      : 60;

  const overallScore = heightBlocked ? 10 : Math.round((waitScore + thrillMatch) / 2);

  return {
    rideId: ride.id,
    overallScore,
    waitScore,
    sentimentScore: 70,
    profileMatchScore: thrillMatch,
    reasoning: heightBlocked
      ? `身高要求 ${ride.heightRequirement}cm，团队中较小的孩子可能无法乘坐。`
      : `符合你的${profile.mode === "family" ? "亲子" : profile.mode === "thrill" ? "刺激" : "休闲"}游玩偏好。`,
    recommended: overallScore >= 60 && !heightBlocked,
    priority: heightBlocked ? "skip" : overallScore >= 75 ? "must-do" : overallScore >= 55 ? "worth-it" : "if-time",
  };
}
