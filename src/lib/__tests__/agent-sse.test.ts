import { describe, it, expect } from "vitest";

/**
 * SSE 分帧的解析规则。前端按 "\n\n" 切事件，最后一段可能是半截，必须留到下个 chunk。
 * 这里把该逻辑单独验证，避免"网络分片刚好切在 JSON 中间"导致整条消息丢失。
 */
function parseSse(chunks: string[]): any[] {
  const events: any[] = [];
  let buffer = "";
  for (const chunk of chunks) {
    buffer += chunk;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        events.push(JSON.parse(line.slice(5).trim()));
      } catch {
        // 忽略无法解析的帧
      }
    }
  }
  return events;
}

const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe("SSE 分帧解析", () => {
  it("解析完整的多个事件", () => {
    const events = parseSse([
      frame({ type: "delta", text: "你" }) + frame({ type: "delta", text: "好" }),
    ]);
    expect(events.map((e) => e.text)).toEqual(["你", "好"]);
  });

  it("事件被网络分片切成两半时不丢失", () => {
    const full = frame({ type: "delta", text: "排队约30分钟" });
    const cut = Math.floor(full.length / 2);
    const events = parseSse([full.slice(0, cut), full.slice(cut)]);
    expect(events).toEqual([{ type: "delta", text: "排队约30分钟" }]);
  });

  it("JSON 内含换行时不会被误切", () => {
    const events = parseSse([frame({ type: "delta", text: "第一行\n第二行" })]);
    expect(events[0].text).toBe("第一行\n第二行");
  });

  it("工具事件与文本事件混合时按序还原", () => {
    const events = parseSse([
      frame({ type: "tool", name: "get_wait_times", iteration: 1 }) +
        frame({ type: "delta", text: "TRON " }) +
        frame({ type: "done", response: "TRON 排队 85 分钟", iterations: 2, toolCalls: ["get_wait_times"] }),
    ]);
    expect(events.map((e) => e.type)).toEqual(["tool", "delta", "done"]);
    expect(events[2].toolCalls).toEqual(["get_wait_times"]);
  });

  it("残缺的尾帧不产生半个事件", () => {
    const events = parseSse([`data: {"type":"delta","tex`]);
    expect(events).toEqual([]);
  });
});
