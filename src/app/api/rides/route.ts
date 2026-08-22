import { NextRequest, NextResponse } from "next/server";
import { getRidesByPark, getParkById } from "@/lib/parks-data";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";

/**
 * 园区项目清单。
 * 供评测脚本构造确定性评分，也让前端不必把项目数据打进客户端包。
 */
export async function GET(req: NextRequest) {
  const limited = checkRateLimit(req, "rides", RATE_LIMITS.data);
  if (limited.response) return limited.response;

  const parkId = req.nextUrl.searchParams.get("park") ?? "shanghai";
  const park = getParkById(parkId);
  if (!park) return NextResponse.json({ error: `未知园区: ${parkId}` }, { status: 404 });

  return NextResponse.json(
    { park: park.name, rides: getRidesByPark(parkId) },
    { headers: limited.headers }
  );
}
