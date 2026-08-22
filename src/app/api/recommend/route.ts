import { NextRequest, NextResponse } from "next/server";
import { scoreRides } from "@/lib/scoring";
import { UserProfile, LiveWaitData, Review } from "@/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    profile?: UserProfile;
    waitTimes?: LiveWaitData[];
    reviews?: Record<string, Review[]>;
  };

  if (!body.profile) return NextResponse.json({ error: "profile 必填" }, { status: 400 });

  const result = await scoreRides({
    profile: body.profile,
    waitTimes: body.waitTimes,
    reviews: body.reviews,
  });
  return NextResponse.json(result);
}
