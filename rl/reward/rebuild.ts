/**
 * 从纯消息序列重建 Trajectory（veRL 桥接用）
 *
 * veRL 侧收集到的往往只有 messages（system/user/assistant 轮次），
 * 没有逐步的解析结构。这里用同一个协议解析器重放 assistant 输出、
 * 配对后续 <tool_response>，重建出 reward 需要的 steps 统计。
 * 与 rollout 实时记录相比信息等价（解析器相同），因此打分一致。
 */

import { parseAgentStep } from "../agent/protocol";
import type { Trajectory, ChatMessage, EpisodeStep } from "../agent/loop";
import type { ToolResult } from "../env/util";

function extractToolResult(content: string): ToolResult | null {
  const m = content.match(/<tool_response>([\s\S]*?)<\/tool_response>/);
  if (!m) return null;
  try {
    const value = JSON.parse(m[1]);
    if (!value || typeof value !== "object" ||
        !(value.ok === true && "result" in value || value.ok === false && typeof value.error === "string")) return null;
    return value as ToolResult;
  } catch {
    return null;
  }
}

export function rebuildTrajectoryFromMessages(messages: ChatMessage[]): Trajectory {
  const steps: EpisodeStep[] = [];
  let answer: string | null = null;
  let answerRepaired = false;
  let toolCallCount = 0;
  let formatErrorCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const parsed = parseAgentStep(msg.content);
    formatErrorCount += parsed.errors.length;

    // 配对紧随其后的 tool_response（user 消息）
    let toolResult: ToolResult | null = null;
    const next = messages[i + 1];
    if (parsed.toolCall && next?.role === "user") {
      toolResult = extractToolResult(next.content);
      toolCallCount++;
    }
    steps.push({ raw: msg.content, parsed, toolResult });

    if (parsed.answer !== null) {
      answer = parsed.answer;
      answerRepaired = parsed.answerRepaired;
      break; // Real rollout terminates at the first valid answer.
    }
  }

  return {
    messages, steps, answer, answerRepaired,
    stoppedReason: answer !== null ? "answer" : "max_turns",
    toolCallCount, formatErrorCount,
    earlyStopTriggered: messages.some((m) => m.role === "user" && m.content.includes("上下文接近上限")),
  };
}
