import { NextResponse } from "next/server";
import { rateLimit, clientKey, RateLimitResult } from "./rate-limit";

export type RateLimitConfig = { limit: number; windowMs: number };

/** 各路由的额度。调用 Claude 的路由收得紧，纯数据路由收得松。 */
export const RATE_LIMITS = {
  agent: { limit: Number(process.env.RATE_LIMIT_AGENT ?? 20), windowMs: 60_000 },
  llm: { limit: Number(process.env.RATE_LIMIT_LLM ?? 10), windowMs: 60_000 },
  data: { limit: Number(process.env.RATE_LIMIT_DATA ?? 120), windowMs: 60_000 },
} satisfies Record<string, RateLimitConfig>;

function headers(r: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(Math.ceil((r.resetAt - Date.now()) / 1000)),
  };
}

/**
 * 超额时返回 429，否则返回 null（表示放行），并把配额头交给调用方附到响应上。
 */
export function checkRateLimit(
  req: Request,
  bucket: string,
  config: RateLimitConfig
): { response: NextResponse | null; headers: Record<string, string> } {
  const result = rateLimit(`${bucket}:${clientKey(req)}`, config.limit, config.windowMs);
  const h = headers(result);

  if (!result.allowed) {
    return {
      response: NextResponse.json(
        { error: `请求过于频繁，请 ${result.retryAfterSeconds} 秒后再试` },
        { status: 429, headers: { ...h, "Retry-After": String(result.retryAfterSeconds) } }
      ),
      headers: h,
    };
  }

  return { response: null, headers: h };
}
