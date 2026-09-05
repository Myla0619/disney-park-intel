import { sharedKeyPool } from "./key-pool";
/**
 * Rollout 循环：驱动一次完整的 Agent episode
 *
 * 用途：
 *   1. 数据蒸馏——教师模型（OpenAI 兼容端点）在沙箱环境里跑轨迹
 *   2. RL rollout——学生模型（vLLM 端点）采样
 *   3. 评估——base / SFT / SFT+RL 三方对比跑同一批任务
 *
 * 调用方护栏（对应面试题三"调用方"部分）全部在这里实现：
 *   - 最大工具调用次数限制（防死循环）
 *   - 上下文接近上限时强制 early-stop 总结
 *   - 失败感知：工具错误作为 tool_response 回传
 *   - answer 标签未闭合的兜底补救
 */

import { parseAgentStep, validateToolCall, formatToolResponse, type ParsedStep } from "./protocol";
import { buildSystemPrompt } from "./prompt";
import { callTool, TOOL_REGISTRY, type ToolContext } from "../env/tools";
import type { ToolResult } from "../env/util";
import { withTimeout } from "../env/util";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LLM {
  chat(messages: ChatMessage[]): Promise<string>;
}

/** OpenAI 兼容端点客户端（vLLM / DeepSeek / 通义等都适用） */
export class OpenAICompatLLM implements LLM {
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey = process.env.LLM_API_KEY ?? "EMPTY",
    private temperature = 0.7
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const keys = this.apiKey === (process.env.LLM_API_KEY ?? "EMPTY") && process.env.LLM_API_KEYS
      ? JSON.parse(process.env.LLM_API_KEYS) as string[] : [this.apiKey];
    const pool = sharedKeyPool(keys);
    const deadline = Date.now() + 120_000;
    for (let attempt=0; attempt<3; attempt++) {
      const lease=await pool.acquire(deadline);
      try {
        const res=await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${lease.key}`},
          body:JSON.stringify({model:this.model,messages,temperature:this.temperature,
            max_tokens:Number(process.env.LLM_MAX_TOKENS ?? 4096)}),
          signal:AbortSignal.timeout(Math.max(1,deadline-Date.now())),
        });
        const retry=res.headers.get("retry-after");
        const seconds=retry ? Number(retry) : NaN;
        const delay=Number.isFinite(seconds)?seconds*1000:retry?Math.max(0,Date.parse(retry)-Date.now()):1000*2**attempt;
        lease.release(res.status,delay);
        if(!res.ok) {
          if([401,403,429].includes(res.status)||res.status>=500)continue;
          throw new Error(`LLM HTTP ${res.status}`);
        }
        const data=await res.json();
        const content=data.choices?.[0]?.message?.content;
        if(typeof content!=="string"||!content.trim())throw new Error("LLM returned no text content");
        return content;
      } catch(e) {
        lease.release(503,1000*2**attempt);
        if(attempt===2 || Date.now()>=deadline)throw e;
      }
    }
    throw new Error("LLM retry budget exhausted");
  }
}

/** 冒烟测试用：按脚本顺序吐输出 */
export class ScriptedLLM implements LLM {
  private i = 0;
  constructor(private outputs: string[]) {}
  async chat(): Promise<string> {
    if (this.i >= this.outputs.length) throw new Error("ScriptedLLM 脚本耗尽");
    return this.outputs[this.i++];
  }
}

export type ToolCaller = (name: string, args: any) => Promise<ToolResult>;

/** 环境直调（同进程，蒸馏/评估用） */
export function makeDirectCaller(ctx: ToolContext): ToolCaller {
  return (name, args) => callTool(name, args, ctx);
}

/** 走 HTTP 工具环境服务（分布式 rollout 用） */
export function makeHttpCaller(baseUrl: string, mode = "sandbox"): ToolCaller {
  return async (name, args) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: name, args, mode }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: false, error: `Tool HTTP ${res.status}` };
    const body = await res.json();
    if (!body || (body.ok !== true && body.ok !== false) ||
        (body.ok === true && !("result" in body)) || (body.ok === false && typeof body.error !== "string")) {
      return { ok: false, error: "Invalid tool response envelope" };
    }
    return body as ToolResult;
  };
}

export type EpisodeStep = {
  raw: string;
  parsed: ParsedStep;
  toolResult: ToolResult | null;
};

export type Trajectory = {
  messages: ChatMessage[];
  steps: EpisodeStep[];
  answer: string | null;
  answerRepaired: boolean;
  stoppedReason: "answer" | "max_turns" | "llm_error" | "context_budget" | "timeout";
  toolCallCount: number;
  formatErrorCount: number;
  earlyStopTriggered: boolean;
};

export type EpisodeOpts = {
  allowLegacyAssistantCall?: boolean; // 仅旧 GRPO 推理兼容；训练/原生评测默认关闭
  maxTurns?: number;          // 最大模型轮数（含最终 answer 轮）
  maxToolCalls?: number;      // 最大工具调用次数
  maxContextChars?: number;   // 上下文字符预算，接近时强制总结
  timeoutMs?: number;         // 单 episode 墙钟超时（防单样本卡死批量蒸馏进程）
  systemPrompt?: string;      // 覆盖默认生成的 system prompt
};

const EARLY_STOP_NUDGE =
  "（系统提示：上下文接近上限，停止调用工具，立即基于已有信息用 <answer> 输出最终回答）";

export async function runEpisode(
  llm: LLM,
  task: { parkId: string; query: string },
  caller: ToolCaller,
  opts: EpisodeOpts = {}
): Promise<Trajectory> {
  const maxTurns = opts.maxTurns ?? 30;
  const maxToolCalls = opts.maxToolCalls ?? 25;
  const maxContextChars = opts.maxContextChars ?? 60_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 600_000);

  const messages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt ?? buildSystemPrompt(task.parkId) },
    { role: "user", content: task.query },
  ];
  const steps: EpisodeStep[] = [];
  let toolCallCount = 0;
  let formatErrorCount = 0;
  let earlyStopTriggered = false;

  const contextSize = () => messages.reduce((s, m) => s + m.content.length, 0);

  for (let turn = 0; turn < maxTurns; turn++) {
    if (contextSize() > maxContextChars) {
      earlyStopTriggered = true;
      return finish("context_budget", null, false);
    }
    if (Date.now() >= deadline) {
      return finish("timeout", null, false);
    }
    let raw: string;
    try {
      raw = await withTimeout(llm.chat(messages), Math.max(1, deadline - Date.now()), "LLM");
    } catch (e: any) {
      return finish(Date.now() >= deadline ? "timeout" : "llm_error", null, false);
    }
    messages.push({ role: "assistant", content: raw });

    const parsed = parseAgentStep(raw, { allowLegacyAssistantCall: opts.allowLegacyAssistantCall });
    formatErrorCount += parsed.errors.length;
    const step: EpisodeStep = { raw, parsed, toolResult: null };
    steps.push(step);

    // 终态：拿到答案（含补救的）
    if (parsed.answer !== null) {
      return finish("answer", parsed.answer, parsed.answerRepaired);
    }

    // 工具调用
    let feedback: ToolResult;
    if (parsed.toolCall) {
      const invalid = validateToolCall(parsed.toolCall, TOOL_REGISTRY);
      if (invalid) {
        feedback = { ok: false, error: invalid };
      } else if (toolCallCount >= maxToolCalls) {
        feedback = { ok: false, error: `已达到最大工具调用次数（${maxToolCalls}），请立即输出 <answer>` };
      } else {
        toolCallCount++;
        try {
          feedback = await withTimeout(caller(parsed.toolCall.name, parsed.toolCall.arguments), Math.max(1, deadline - Date.now()), "tool");
        } catch {
          if (Date.now() >= deadline) return finish("timeout", null, false);
          feedback = { ok: false, error: "工具调用异常，请修正或稍后重试" };
        }
      }
    } else {
      // 格式坏掉：把格式错误作为反馈回传，让模型自我纠正
      feedback = { ok: false, error: `输出格式错误: ${parsed.errors.join("; ")}。请按 <tool_call> 或 <answer> 格式重新输出` };
    }
    step.toolResult = feedback;

    // Reserve space for one final answer before reaching the hard context cap.
    let responseMsg = formatToolResponse(feedback);
    if (contextSize() + responseMsg.length > maxContextChars * 0.8 || toolCallCount >= maxToolCalls) {
      responseMsg += `\n${EARLY_STOP_NUDGE}`;
      earlyStopTriggered = true;
    }
    messages.push({ role: "user", content: responseMsg });
  }

  return finish("max_turns", null, false);

  function finish(
    reason: Trajectory["stoppedReason"],
    answer: string | null,
    repaired: boolean
  ): Trajectory {
    return {
      messages, steps, answer, answerRepaired: repaired,
      stoppedReason: reason, toolCallCount, formatErrorCount, earlyStopTriggered,
    };
  }
}
