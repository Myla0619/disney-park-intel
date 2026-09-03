import { NextRequest, NextResponse } from "next/server";
import { getReviews } from "@/lib/reviews";
import { parseQuery } from "@/lib/api/respond";
import { ReviewsQuerySchema } from "@/lib/api/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";

/** 单次批量查询的上限，防止用超长 id 列表压垮接口。 */
const MAX_BATCH = 40;

export async function GET(req: NextRequest) {
  const limited = checkRateLimit(req, "reviews", RATE_LIMITS.data);
  if (limited.response) return limited.response;

  const parsed = parseQuery(new URL(req.url), ReviewsQuerySchema);
  if (!parsed.ok) return parsed.response;

  const { rideId, restaurantId, rideIds } = parsed.data;

  // 批量：面板一次需要全部项目的评论，逐个请求是 24 个网络往返
  if (rideIds) {
    const ids = [...new Set(rideIds.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_BATCH);
    const entries = await Promise.all(
      ids.map(async (id) => [id, await getReviews(id, "ride")] as const)
    );
    return NextResponse.json(
      { byRide: Object.fromEntries(entries) },
      { headers: limited.headers }
    );
  }

  const result = await getReviews(rideId ?? restaurantId!, rideId ? "ride" : "restaurant");
  return NextResponse.json(result, { headers: limited.headers });
}
