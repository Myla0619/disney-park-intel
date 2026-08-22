/**
 * 请求限流
 *
 * /api/agent、/api/recommend、/api/itinerary 每次调用都会花掉 Anthropic 额度。
 * 公开部署且无任何限制时，任何人都能用一个 for 循环把 key 的额度刷干净。
 *
 * 实现是固定窗口计数器，状态在进程内。Serverless 上每个实例各算各的，因此实际
 * 生效阈值是「阈值 × 实例数」——它挡得住脚本刷量，挡不住分布式滥用。要严格限流，
 * 设置 UPSTASH_REDIS_REST_URL 后换用共享计数器（见 README「部署」）。
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** 当前窗口重置的 Unix 毫秒时间戳 */
  resetAt: number;
  retryAfterSeconds: number;
};

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** 惰性清理：每次调用顺手扔掉已过期的窗口，避免 Map 无界增长。 */
function sweep(now: number) {
  if (windows.size < 1000) return;
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }

  w.count++;
  const allowed = w.count <= limit;

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - w.count),
    resetAt: w.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
  };
}

/** 仅供测试使用。 */
export function __resetRateLimits() {
  windows.clear();
}

/**
 * 取调用方标识。
 *
 * 反向代理后 req.ip 通常是代理地址，需要读 x-forwarded-for 的第一跳。
 * 这个头可被伪造，所以限流只是成本控制，不是安全边界。
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
