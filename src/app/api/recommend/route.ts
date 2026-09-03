import { NextRequest, NextResponse } from "next/server";
import { scoreRides } from "@/lib/scoring";
import { parseBody } from "@/lib/api/respond";
import { RecommendBodySchema } from "@/lib/api/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";
import { isAnthropicConfigured } from "@/lib/anthropic-client";
import { UserProfile, Review } from "@/types";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "recommend", RATE_LIMITS.llm);
  if (limited.response) return limited.response;

  const parsed = await parseBody(req, RecommendBodySchema);
  if (!parsed.ok) return parsed.response;

  // 未配置 key 时不报错：scoreRides 会走本地规则评分，返回 fallback: true
  const result = await scoreRides({
    profile: parsed.data.profile as UserProfile,
    waitTimes: parsed.data.waitTimes,
    reviews: parsed.data.reviews as Record<string, Review[]>,
  });

  return NextResponse.json(
    { ...result, aiAvailable: isAnthropicConfigured() },
    { headers: limited.headers }
  );
}
