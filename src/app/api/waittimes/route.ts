import { NextRequest, NextResponse } from "next/server";
import { getParkById } from "@/lib/parks-data";
import { getLiveWaitTimes, getPredictedWaitTimes } from "@/lib/wait-times";
import { parseQuery } from "@/lib/api/respond";
import { WaitTimesQuerySchema } from "@/lib/api/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";

export async function GET(req: NextRequest) {
  const limited = checkRateLimit(req, "waittimes", RATE_LIMITS.data);
  if (limited.response) return limited.response;

  const parsed = parseQuery(new URL(req.url), WaitTimesQuerySchema);
  if (!parsed.ok) return parsed.response;

  const { park: parkId, mode, date } = parsed.data;
  const park = getParkById(parkId);
  if (!park) return NextResponse.json({ error: `未知园区: ${parkId}` }, { status: 404 });

  const visitDate = date ?? new Date().toISOString().slice(0, 10);
  const result =
    mode === "historical"
      ? await getPredictedWaitTimes(parkId, visitDate)
      : await getLiveWaitTimes(parkId);

  return NextResponse.json({ ...result, park: park.name }, { headers: limited.headers });
}
