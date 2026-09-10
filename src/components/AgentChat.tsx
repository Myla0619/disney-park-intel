"use client";

import { useState, useRef, useEffect } from "react";
import { useProfileStore } from "@/lib/store";
import { Send, Bot, User, Sparkles, Loader2, Route, Check } from "lucide-react";
import type { ItineraryItem } from "@/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  /** 正在调用的工具，流式过程中显示给用户 */
  activeTool?: string;
  proposedItinerary?: ItineraryItem[];
  planApplied?: boolean;
};

/** 工具名 → 面向用户的说法 */
const TOOL_LABELS: Record<string, string> = {
  get_wait_times: "查询等待时间",
  search_reviews: "检索用户评论",
  plan_itinerary: "重新规划行程",
  get_spot_info: "查询地点详情",
};

const QUICK_PROMPTS = [
  { icon:"⚡", text:"现在哪个项目等待最短？" },
  { icon:"📍", text:"我在宝藏湾，下一步去哪？" },
  { icon:"👧", text:"我女儿5岁，适合玩哪些？" },
  { icon:"📸", text:"最佳拍照时间和地点是？" },
  { icon:"🍽️", text:"推荐一个不用预约的餐厅" },
  { icon:"🎠", text:"花车巡游在哪里看最好？" },
];

type AgentChatProps = {
  completedItemIds?: string[];
  onApplyItinerary?: (itinerary: ItineraryItem[]) => void;
};

const GREETING: Message = {
  role: "assistant",
  content: "你好，我可以帮你查等待时间、找评价，也可以根据当前位置和已完成项目重排今天的路线。需要重排时，我会先给出方案，由你确认后再应用。",
  timestamp: new Date(),
};

export default function AgentChat({ completedItemIds = [], onApplyItinerary }: AgentChatProps) {
  const profile = useProfileStore((s) => s.profile);
  const chatKey = `disney-agent-chat-v1:${profile?.park ?? "shanghai"}:${profile?.visitDate ?? "default"}`;
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(chatKey) ?? "null");
      if (saved?.sessionId) setSessionId(saved.sessionId);
      else setSessionId(`session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      if (Array.isArray(saved?.messages) && saved.messages.length) {
        setMessages(saved.messages.map((m: Message & { timestamp: string }) => ({
          ...m,
          timestamp: new Date(m.timestamp),
          isLoading: false,
          activeTool: undefined,
        })));
      } else {
        setMessages([{ ...GREETING, timestamp: new Date() }]);
      }
    } catch {
      setSessionId(`session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    } finally {
      setHydrated(true);
    }
  }, [chatKey]);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    const settled = messages.filter((m) => !m.isLoading).slice(-50);
    localStorage.setItem(chatKey, JSON.stringify({ sessionId, messages: settled }));
  }, [chatKey, hydrated, messages, sessionId]);

  const sendMessage = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || loading || !sessionId) return;
    setInput("");

    const history = messages
      .filter((m) => !m.isLoading)
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));

    const userMsg: Message = { role:"user", content:msg, timestamp:new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // 加载占位
    setMessages((prev) => [...prev, { role:"assistant", content:"", timestamp:new Date(), isLoading:true }]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, sessionId, profile, completedItemIds, history }),
      });

      // 限流、未配置 key 等情况仍返回 JSON，如实把原因告诉用户
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        setMessages((prev) => [
          ...prev.filter((m) => !m.isLoading),
          {
            role: "assistant",
            content: detail?.error ?? "请求失败，请稍后重试。",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      // 占位气泡就地变成流式气泡，逐段填入内容
      setMessages((prev) =>
        prev.map((m) => (m.isLoading ? { ...m, isLoading: false, content: "" } : m))
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";

      const patchLast = (patch: Partial<Message>) =>
        setMessages((prev) =>
          prev.map((m, i) => (i === prev.length - 1 ? { ...m, ...patch } : m))
        );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 以空行分隔事件；最后一段可能不完整，留在 buffer 里等下一个 chunk
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;

          let event: any;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === "provider") {
            text = "";
            patchLast({ content: "", activeTool: undefined });
          } else if (event.type === "delta") {
            text += event.text;
            patchLast({ content: text, activeTool: undefined });
          } else if (event.type === "tool") {
            patchLast({ activeTool: TOOL_LABELS[event.name] ?? event.name });
          } else if (event.type === "tool_result" && event.name === "plan_itinerary") {
            const plan = event.result?.itinerary;
            if (Array.isArray(plan) && plan.length) patchLast({ proposedItinerary: plan });
          } else if (event.type === "error") {
            patchLast({ content: event.message, activeTool: undefined });
          } else if (event.type === "done") {
            patchLast({ content: event.response || text, activeTool: undefined });
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => !m.isLoading),
        { role: "assistant", content: "网络错误，请检查连接后重试。", timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-night-900">
      {/* 页头 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-night-800/55">
        <div className="w-8 h-8 rounded-full bg-magic-500/20 border border-magic-400/35 flex items-center justify-center">
          <Bot className="w-4 h-4 text-magic-400" />
        </div>
        <div>
          <div className="font-medium text-white text-sm">迪士尼 AI 助手</div>
          <div className="text-white/40 text-xs flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-meadow-400" />
            智能问答 · 工具查询 · 评论检索
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === "user" ? "bg-magic-500" : "bg-night-700"
            }`}>
              {msg.role === "user"
                ? <User className="w-3.5 h-3.5 text-white" />
                : <Sparkles className="w-3.5 h-3.5 text-magic-400" />
              }
            </div>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
              msg.role === "user"
                ? "bg-magic-500 text-white rounded-tr-sm"
                : "bg-night-800 text-white/90 rounded-tl-sm border border-white/5"
            }`}>
              {msg.isLoading ? (
                <div className="flex gap-1 items-center py-1">
                  <Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin" />
                  <span className="text-white/40 text-sm">正在思考…</span>
                </div>
              ) : (
                <>
                  {msg.content && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.activeTool && (
                    <div className="flex gap-1.5 items-center py-1">
                      <Loader2 className="w-3.5 h-3.5 text-magic-400/70 animate-spin" />
                      <span className="text-white/50 text-sm">正在{msg.activeTool}…</span>
                    </div>
                  )}
                  {msg.proposedItinerary?.length ? (
                    <div className="mt-3 rounded-xl border border-magic-400/25 bg-magic-500/10 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <Route className="h-4 w-4 text-magic-300" />
                        新路线已生成
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-white/50">
                        共 {msg.proposedItinerary.length} 项，确认后会替换“今日行程”。
                      </p>
                      <button
                        type="button"
                        disabled={msg.planApplied}
                        onClick={() => {
                          onApplyItinerary?.(msg.proposedItinerary!);
                          setMessages((prev) => prev.map((item, index) => index === i ? { ...item, planApplied: true } : item));
                        }}
                        className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-magic-500 px-3 text-sm font-medium text-white transition-colors hover:bg-magic-400 disabled:bg-meadow-500/20 disabled:text-meadow-300"
                      >
                        {msg.planApplied ? <><Check className="h-4 w-4" /> 已应用到今日行程</> : "应用到今日行程"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
              <div className={`text-xs mt-1 ${msg.role === "user" ? "text-magic-200" : "text-white/30"}`}>
                {msg.timestamp.toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit" })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷提问 */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
        {QUICK_PROMPTS.map((p) => (
          <button key={p.text} onClick={() => sendMessage(p.text)} disabled={loading}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-night-800 hover:bg-night-700 border border-white/10 rounded-full text-xs text-white/60 hover:text-white/80 transition-all disabled:opacity-30">
            <span>{p.icon}</span>
            <span>{p.text}</span>
          </button>
        ))}
      </div>

      {/* 输入框 */}
      <div className="px-4 pb-4 pt-2">
        <div className="flex gap-2 bg-night-800 border border-white/10 rounded-2xl px-3 py-2 focus-within:border-magic-400/50 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="问我任何关于迪士尼的问题…"
            disabled={loading || !hydrated}
            className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
          />
          <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            className="w-7 h-7 rounded-full bg-magic-500 hover:bg-magic-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0">
            {loading ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}
