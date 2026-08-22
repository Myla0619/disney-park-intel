/**
 * Agent 编排器
 *
 * 单轮请求内的 Tool Use 循环：Claude 选工具 → 本地执行 → 结果回灌 → 直到给出
 * 最终回答或达到迭代上限。工具实现见 ./execute-tool.ts，会话状态见
 * @/lib/session-memory。
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DISNEY_TOOLS } from "./tools";
import { executeTool } from "./execute-tool";
import {
  getSession, createSession, addMessage, buildMemoryContext, SessionMemory,
} from "@/lib/session-memory";
import { inferAndUpdatePreferences } from "@/lib/preference-inference";
import { getRidesByPark } from "@/lib/parks-data";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic-client";
import { AGENT_MODEL, AGENT_MAX_ITERATIONS } from "@/lib/models";
import { parseBody } from "@/lib/api/respond";
import { AgentBodySchema } from "@/lib/api/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/with-rate-limit";
import { UserProfile } from "@/types";

const PARK_ID = "shanghai";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "agent", RATE_LIMITS.agent);
  if (limited.response) return limited.response;

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "服务端未配置 ANTHROPIC_API_KEY，AI 助手不可用" },
      { status: 503 }
    );
  }

  const parsed = await parseBody(req, AgentBodySchema);
  if (!parsed.ok) return parsed.response;
  const { message, sessionId } = parsed.data;
  const profile = parsed.data.profile as UserProfile | undefined;

  let session = await getSession(sessionId);
  if (!session && profile) session = await createSession(sessionId, profile);
  if (!session) {
    return NextResponse.json(
      { error: "会话不存在，请在请求中带上 profile 以创建会话" },
      { status: 400 }
    );
  }

  await addMessage(sessionId, "user", message);

  const messages: Anthropic.MessageParam[] = [
    ...session.conversationHistory.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  let finalResponse = "";
  let iterations = 0;
  const toolCalls: string[] = [];

  try {
    while (iterations < AGENT_MAX_ITERATIONS) {
      iterations++;

      const response = await getAnthropicClient().messages.create({
        model: AGENT_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: buildSystemPrompt(session),
        tools: DISNEY_TOOLS,
        messages,
      });

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        // 并行工具调用必须把全部 tool_result 放在同一条 user 消息里回传，
        // 拆成多条会让模型逐渐不再并行调用。
        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolUseBlocks.map(async (block) => {
            toolCalls.push(block.name);
            const result = await executeTool(block.name, block.input as any, session!);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
              is_error: "error" in result,
            };
          })
        );

        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      finalResponse =
        response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("") || "抱歉，我没能处理这个请求，换个说法再试试？";
      break;
    }

    // 迭代耗尽仍未收敛：明确告诉用户，而不是静默返回空串
    if (!finalResponse) {
      finalResponse = "这个问题涉及的查询有点多，我没能在限定步骤内查完。可以把问题拆细一点再问我吗？";
    }
  } catch (err: any) {
    console.error("[agent] Claude 调用失败:", err);
    return NextResponse.json(
      { error: "AI 助手暂时不可用，请稍后再试" },
      { status: 502 }
    );
  }

  await addMessage(sessionId, "assistant", finalResponse);
  await inferAndUpdatePreferences(message, sessionId);

  return NextResponse.json(
    { response: finalResponse, sessionId, iterations, toolCalls },
    { headers: limited.headers }
  );
}

// ─── 系统提示词 ──────────────────────────────────────────────────────────────
function buildSystemPrompt(session: SessionMemory): string {
  const p = session.baseProfile;
  const rideList = getRidesByPark(PARK_ID)
    .map(
      (r) =>
        `${r.id}: ${r.name}（${r.areaName}，身高${r.heightRequirement ?? "无限制"}cm）`
    )
    .join("\n");

  const kids = p.kids ?? [];

  return `你是上海迪士尼乐园的专属智能助手，帮游客规划行程、查询等待时间、推荐美食和拍照点。

可用工具：
- get_wait_times：查询实时或预测等待时间
- search_reviews：语义检索相关用户评论
- plan_itinerary：重新规划行程
- get_spot_info：获取项目/拍照点/餐厅/商店详情

游客档案：
- 游玩模式：${p.mode}
- 入园：${p.arrivalTime}，离园：${p.departureTime}
- 孩子：${kids.length ? kids.map((k) => `${k.age}岁/${k.heightCm}cm`).join("、") : "无"}
- 优速通：${p.llPackage}

${buildMemoryContext(session)}

园区项目列表（用于理解用户提到的项目）：
${rideList}

回答规则：
1. 等待时间、身高限制、演出场次一律通过工具获取，不要凭记忆回答
2. 工具结果里 isFallbackData / isSampleData 为 true 时，说明这是降级或示例数据，
   要向用户说明"当前无法获取实时数据"，不要把它当作真实排队时间陈述
3. 用中文回答，简洁实用，适合手机阅读
4. 用户提到新偏好（怕高、不想排队、有老人同行等）时，在回答中自然地把它考虑进去
5. 花车与烟花时间以迪士尼官方 App 当天公布为准`;
}
