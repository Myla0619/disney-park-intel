import { NextRequest, NextResponse } from "next/server";
import { getParkById } from "@/lib/parks-data";
import { getLiveWaitTimes, getPredictedWaitTimes } from "@/lib/wait-times";

export async function GET(req: NextRequest) {
  const parkId = req.nextUrl.searchParams.get("park") ?? "shanghai";
  const mode = req.nextUrl.searchParams.get("mode") ?? "live";
  const visitDate = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const park = getParkById(parkId);
  if (!park) return NextResponse.json({ error: "未知园区" }, { status: 400 });

  const result =
    mode === "historical"
      ? await getPredictedWaitTimes(parkId, visitDate)
      : await getLiveWaitTimes(parkId);

  return NextResponse.json({ ...result, park: park.name });
}
