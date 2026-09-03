/**
 * LLM 调用的用量与成本记录
 *
 * 上线前必须知道「一个用户走完一遍流程要花多少钱」——这个数字决定商业模式是否成立。
 * 没有这层记录，成本只能在月底账单上事后发现。
 *
 * 单价随模型与促销变化，这里的表是估算用途，不作为对账依据。
 */

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function estimateCostUsd(model: string, usage: UsageLike): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  // 缓存读取按约 0.1 倍计价，缓存写入按约 1.25 倍
  const cachedRead = usage.cache_read_input_tokens ?? 0;
  const cachedWrite = usage.cache_creation_input_tokens ?? 0;
  const inputCost =
    ((usage.input_tokens + cachedWrite * 1.25 + cachedRead * 0.1) / 1_000_000) * price.input;
  const outputCost = (usage.output_tokens / 1_000_000) * price.output;
  return inputCost + outputCost;
}

/** 结构化输出一条用量记录，便于日志采集端聚合。 */
export function logUsage(operation: string, model: string, usage: UsageLike) {
  const cost = estimateCostUsd(model, usage);
  console.log(
    JSON.stringify({
      event: "llm_usage",
      operation,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      estimatedCostUsd: cost == null ? null : +cost.toFixed(6),
    })
  );
}
