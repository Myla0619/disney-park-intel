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

export function parseAgentStep(text: string, opts: { allowLegacyAssistantCall?: boolean } = {}): ParsedStep {
  const errors: string[] = [];
  // Opt-in inference compatibility only. Never apply to tool-result messages,
  // training targets, or native-model evaluation. Keep the format violation.
  if (opts.allowLegacyAssistantCall) {
    const legacy = text.match(/^(\s*<think>(?:(?!<\/?think>)[\s\S])*<\/think>\s*)<tool_response>([^<>]*)<\/tool_response>(\s*)$/);
    if (legacy) {
      try {
        const call = JSON.parse(legacy[2]);
        if (call && typeof call.name === "string" && call.name && call.arguments &&
            typeof call.arguments === "object" && !Array.isArray(call.arguments)) {
          text = `${legacy[1]}<tool_call>${legacy[2]}</tool_call>${legacy[3]}`;
          errors.push("旧模型误用 <tool_response> 发起调用（兼容修复，仍计格式错误）");
        }
      } catch { /* Invalid JSON stays invalid. */ }
    }
  }

  const think = extractTag(text, "think");
  if (think.count !== 1 || think.unclosed) errors.push("必须有一个闭合的 <think>");
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
      } else if (!parsed.arguments || typeof parsed.arguments !== "object" || Array.isArray(parsed.arguments)) {
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
  // Fail closed: never execute the first call from a multi-call/mixed transcript.
  const envelope = /^\s*<think>([\s\S]*?)<\/think>\s*(?:<tool_call>([\s\S]*?)<\/tool_call>|<answer>([\s\S]*?)<\/answer>)\s*$/.test(text);
  if (!envelope || think.count !== 1 || tc.count + ans.count !== 1 || text.includes("<tool_response>")) {
    errors.push("协议必须为 think 后跟唯一 tool_call 或 answer，不允许额外内容");
    toolCall = null;
    answer = null;
  }
  if (answer !== null && !answer.trim()) {
    errors.push("answer 不能为空");
    answer = null;
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
  return validateSchema(call.arguments, tool.input_schema, `工具 ${call.name}`);
}

/** Supported JSON Schema subset, shared by direct calls and HTTP dispatch. */
export function validateSchema(value: unknown, schema: any, path = "arguments"): string | null {
  if (!schema || typeof schema !== "object") return `${path}: 缺少 schema`;
  const type = schema.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return `${path}: 必须是对象`;
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) return `${path}: 缺少必填参数 ${key}`;
    }
    for (const [key, item] of Object.entries(obj)) {
      const prop = schema.properties?.[key];
      if (!prop && schema.additionalProperties === false) return `${path}: 未知参数 ${key}`;
      if (prop) { const error = validateSchema(item, prop, `${path}.${key}`); if (error) return error; }
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) return `${path}: 必须是数组`;
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path}: 数组过短`;
    if (schema.items) for (const item of value) { const error = validateSchema(item, schema.items, path + "[]"); if (error) return error; }
  } else if (type === "string") {
    if (typeof value !== "string" || !value.trim()) return `${path}: 必须是非空字符串`;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path}: 字符串格式错误`;
  } else if (type === "boolean" && typeof value !== "boolean") return `${path}: 必须是布尔值`;
  else if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) return `${path}: 数字类型错误`;
    if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) return `${path}: 数值超出范围`;
  }
  if (schema.enum && !schema.enum.includes(value)) return `${path}: 不在允许枚举中`;
  return null;
}

/** 包装工具返回为注入上下文的格式 */
export function formatToolResponse(result: unknown): string {
  return `<tool_response>${JSON.stringify(result, null, 0).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}</tool_response>`;
}
