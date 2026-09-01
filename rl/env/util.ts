/**
 * 工具环境基础设施：重试 / 超时 / 上下文压缩 / 统一结果信封
 *
 * 所有工具返回 ToolResult 信封，永远不向模型抛 HTTP 500——
 * 失败也作为 {ok:false, error} 回传，让模型感知并自我纠正（失败感知）。
 */

export type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export type EnvMode = "sandbox" | "live";

export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 500
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

/** 深度遍历截断超长字符串，防止工具返回撑爆上下文导致 rollout 提前终止 */
export function truncateStrings<T>(value: T, maxLen = 300): T {
  if (typeof value === "string") {
    return (value.length > maxLen ? value.slice(0, maxLen) + "…" : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => truncateStrings(v, maxLen)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncateStrings(v, maxLen);
    }
    return out as T;
  }
  return value;
}

export function toolError(msg: string): ToolResult {
  return { ok: false, error: msg };
}

export function toolOk(result: unknown, truncate = true): ToolResult {
  return { ok: true, result: truncate ? truncateStrings(result) : result };
}
