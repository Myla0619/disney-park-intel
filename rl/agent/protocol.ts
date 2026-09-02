/**
 * Agent 文本协议：<think> / <tool_call> / <answer>
 *
 * 训练开源模型不能依赖 Anthropic 私有的 tool_use block，
 * 用纯文本标签协议，SFT 冷启动就是教模型遵守这套格式。
 *
 * 每轮输出必须是二选一：
 *   <think>…</think><tool_call>{"name":"…","arguments":{…}}</tool_call>
 *   <think>…</think><answer>…</answer>
 *
 * 解析器同时是三个角色：
 *   1. rollout 循环的执行解析
 *   2. RL 格式 reward 的判定依据（errors 数组）
 *   3. 蒸馏数据清洗的格式校验器
 */

export type ParsedToolCall = { name: string; arguments: Record<string, unknown> };

export type ParsedStep = {
  think: string | null;
  toolCall: ParsedToolCall | null;
  toolCallRaw: string | null;
  answer: string | null;
  /** answer 标签未闭合但做了兜底补救 */
  answerRepaired: boolean;
  /** 格式违规列表，空数组 = 格式完美（供格式 reward 使用） */
  errors: string[];
};

function extractTag(text: string, tag: string): { content: string | null; unclosed: boolean; count: number } {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const matches = [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))];
  if (matches.length > 0) {
    return { content: matches[0][1].trim(), unclosed: false, count: matches.length };
  }
  // 未闭合补救：只有开标签（上下文截断/小模型格式漂移的常见形态）
  const openIdx = text.indexOf(open);
  if (openIdx >= 0 && !text.includes(close)) {
    return { content: text.slice(openIdx + open.length).trim(), unclosed: true, count: 1 };
  }
  return { content: null, unclosed: false, count: 0 };
}

export function parseAgentStep(text: string): ParsedStep {
  const errors: string[] = [];

  const think = extractTag(text, "think");
  if (think.count > 1) errors.push("多个 <think> 块");

  const tc = extractTag(text, "tool_call");
  if (tc.count > 1) errors.push("一轮只能有一个 <tool_call>");
  if (tc.unclosed) errors.push("<tool_call> 标签未闭合");

  const ans = extractTag(text, "answer");
  if (ans.count > 1) errors.push("多个 <answer> 块");

  let toolCall: ParsedToolCall | null = null;
  if (tc.content !== null && !tc.unclosed) {
    try {
      const parsed = JSON.parse(tc.content);
      if (typeof parsed?.name !== "string" || !parsed.name) {
        errors.push("tool_call 缺少 name 字段");
      } else if (parsed.arguments !== undefined && (typeof parsed.arguments !== "object" || Array.isArray(parsed.arguments))) {
        errors.push("tool_call 的 arguments 必须是 JSON 对象");
      } else {
        toolCall = { name: parsed.name, arguments: parsed.arguments ?? {} };
      }
    } catch {
      errors.push("tool_call 内容不是合法 JSON");
    }
  }

  let answer = ans.content;
  const answerRepaired = ans.unclosed && answer !== null;
  if (answerRepaired) errors.push("<answer> 标签未闭合（已兜底补救）");

  // 互斥性检查
  if (toolCall && answer !== null) {
    errors.push("同一轮不能既有 tool_call 又有 answer（以 tool_call 为准）");
    answer = null;
  }
  if (!toolCall && answer === null && tc.content === null) {
    errors.push("既没有 tool_call 也没有 answer");
  }

  return {
    think: think.content,
    toolCall,
    toolCallRaw: tc.content,
    answer,
    answerRepaired,
    errors,
  };
}

/** 按注册表 schema 做轻量参数校验（缺必填/未知工具），错误文案直接回传给模型 */
export function validateToolCall(
  call: ParsedToolCall,
  registry: { name: string; input_schema: any }[]
): string | null {
  const tool = registry.find((t) => t.name === call.name);
  if (!tool) {
    return `未知工具: ${call.name}。可用工具: ${registry.map((t) => t.name).join(", ")}`;
  }
  const required: string[] = tool.input_schema?.required ?? [];
  const missing = required.filter((k) => call.arguments[k] === undefined);
  if (missing.length) {
    return `工具 ${call.name} 缺少必填参数: ${missing.join(", ")}`;
  }
  return null;
}

/** 包装工具返回为注入上下文的格式 */
export function formatToolResponse(result: unknown): string {
  return `<tool_response>${JSON.stringify(result, null, 0)}</tool_response>`;
}
