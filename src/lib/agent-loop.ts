/**
 * Agent 的 Tool Use 循环，以事件流形式产出
 *
 * 做成异步生成器而不是直接写 Response，有两个好处：循环本身可以脱离 HTTP 单测；
 * 路由层只负责把事件序列化成 SSE。
 *
 * 之所以要流式：一轮里可能连着调三四个工具再作答，非流式下用户要盯着转圈等十几秒，
 * 且长回答容易触到请求超时。流式让工具调用过程也可见（"正在查询等待时间…"）。
 */

import Anthropic from "@anthropic-ai/sdk";
import { DISNEY_TOOLS } from "@/app/api/agent/tools";
import { executeTool } from "@/app/api/agent/execute-tool";
import { SessionMemory } from "./session-memory";
import { getAnthropicClient } from "./anthropic-client";
import { AGENT_MODEL, AGENT_MAX_ITERATIONS } from "./models";

export type AgentEvent =
  | { type: "tool"; name: string; iteration: number }
  | { type: "delta"; text: string }
  | { type: "done"; response: string; iterations: number; toolCalls: string[] }
  | { type: "error"; message: string };

export async function* runAgentLoop(
  message: string,
  session: SessionMemory,
  systemPrompt: string
): AsyncGenerator<AgentEvent> {
  const messages: Anthropic.MessageParam[] = [
    ...session.conversationHistory.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const toolCalls: string[] = [];
  let response = "";
  let iterations = 0;

  try {
    while (iterations < AGENT_MAX_ITERATIONS) {
      iterations++;

      const stream = getAnthropicClient().messages.stream({
        model: AGENT_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        tools: DISNEY_TOOLS,
        messages,
      });

      // 文本增量边生成边下发；thinking 块不外泄，只透出面向用户的正文
      let turnText = "";
      stream.on("text", (delta) => {
        turnText += delta;
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta" &&
          event.delta.text
        ) {
          yield { type: "delta", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();

      if (final.stop_reason === "tool_use") {
        const toolUseBlocks = final.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        for (const block of toolUseBlocks) {
          toolCalls.push(block.name);
          yield { type: "tool", name: block.name, iteration: iterations };
        }

        // 并行工具的 tool_result 必须放在同一条 user 消息里回传
        const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const result = await executeTool(block.name, block.input as any, session);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
              is_error: "error" in result,
            };
          })
        );

        messages.push({ role: "assistant", content: final.content });
        messages.push({ role: "user", content: results });
        // 工具调用轮里模型可能已经说了几句过渡语，计入最终回答
        response += turnText;
        continue;
      }

      response += turnText;
      break;
    }

    if (!response.trim()) {
      response = "这个问题涉及的查询有点多，我没能在限定步骤内查完。可以把问题拆细一点再问我吗？";
      yield { type: "delta", text: response };
    }

    yield { type: "done", response, iterations, toolCalls };
  } catch (err: any) {
    console.error("[agent] Claude 调用失败:", err);
    yield { type: "error", message: "AI 助手暂时不可用，请稍后再试" };
  }
}
