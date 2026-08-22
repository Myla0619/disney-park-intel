import { NextRequest, NextResponse } from "next/server";
import { getReviews } from "@/lib/reviews";
import { parseQuery } from "@/lib/api/respond";
import { ReviewsQuerySchema } from "@/lib/api/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";

export async function GET(req: NextRequest) {
  const limited = checkRateLimit(req, "reviews", RATE_LIMITS.data);
  if (limited.response) return limited.response;

  const parsed = parseQuery(new URL(req.url), ReviewsQuerySchema);
  if (!parsed.ok) return parsed.response;

  const { rideId, restaurantId } = parsed.data;
  const result = await getReviews(rideId ?? restaurantId!, rideId ? "ride" : "restaurant");

  return NextResponse.json(result, { headers: limited.headers });
}
