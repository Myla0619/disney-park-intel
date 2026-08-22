import { NextRequest, NextResponse } from "next/server";
import { getReviews } from "@/lib/reviews";

export async function GET(req: NextRequest) {
  const rideId = req.nextUrl.searchParams.get("rideId");
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const id = rideId ?? restaurantId;
  if (!id) return NextResponse.json({ error: "rideId 或 restaurantId 必填" }, { status: 400 });

  const result = await getReviews(id, rideId ? "ride" : "restaurant");
  return NextResponse.json(result);
}
