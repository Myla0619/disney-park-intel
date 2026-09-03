/**
 * Agent 编排器（SSE 流式）
 *
 * 一轮对话里可能连着调三四个工具再作答，非流式下用户要盯着转圈等十几秒，
 * 长回答还容易触到平台的请求超时。这里以 Server-Sent Events 逐段下发：
 * 文本增量实时显示，工具调用过程也对用户可见。
 *
 * 循环本身在 @/lib/agent-loop 里，与 HTTP 解耦以便单测；工具实现见 ./execute-tool。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession, createSession, addMessage, buildMemoryContext, SessionMemory,
} from "@/lib/session-memory";
import { getRidesByPark } from "@/lib/parks-data";
import { isAnthropicConfigured, hasEmptyApiKeyShadow } from "@/lib/anthropic-client";
import { runAgentLoop } from "@/lib/agent-loop";
import { inferAndUpdatePreferences } from "@/lib/preference-inference";
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
      {
        error: hasEmptyApiKeyShadow()
          ? "ANTHROPIC_API_KEY 被设成了空值，它会屏蔽 OAuth 配置档与联合身份凭证。请彻底删除该变量，而不是留空"
          : "服务端未配置 Anthropic 凭证，AI 助手不可用",
      },
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

  const encoder = new TextEncoder();
  const activeSession = session;
  const systemPrompt = buildSystemPrompt(activeSession);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        for await (const event of runAgentLoop(message, activeSession, systemPrompt)) {
          send(event);

          if (event.type === "done") {
            // 落库放在流结束后：中途断连时不应把半截回答写进会话历史
            await addMessage(sessionId, "assistant", event.response);
            await inferAndUpdatePreferences(message, sessionId);
          }
        }
      } catch (err) {
        console.error("[agent] 流式输出中断:", err);
        send({ type: "error", message: "AI 助手暂时不可用，请稍后再试" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...limited.headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 反向代理默认会缓冲响应体，缓冲了就等于没有流式
      "X-Accel-Buffering": "no",
    },
  });
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
