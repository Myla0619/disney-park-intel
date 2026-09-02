/**
 * 答案质量 Judge（第 6 维），可插拔：
 *
 * - HeuristicJudge：离线启发式，训练管线调试和 CI 用（确定性、零成本）。
 *   只做基础健康度判断，不冒充真实质量评估。
 * - LLMJudge：LLM-as-Judge，评价维度 = 匹配度/可行性/丰富度/清晰度（面试题十）。
 *   真实评估用多个 LLMJudge 交叉打分取平均，且 Judge 模型必须未参与训练与蒸馏。
 */

import type { Trajectory } from "../agent/loop";
import type { SeedTask } from "../data/seeds";
import { OpenAICompatLLM } from "../agent/loop";

export interface Judge {
  score(task: SeedTask, t: Trajectory): Promise<{ score: number; detail: string }>;
}

export class HeuristicJudge implements Judge {
  async score(task: SeedTask, t: Trajectory): Promise<{ score: number; detail: string }> {
    const a = t.answer?.trim() ?? "";
    if (!a) return { score: 0, detail: "无答案" };

    let s = 0.5;
    const notes: string[] = [];

    // 长度健康：太短没信息量，太长可能是复读
    if (a.length >= 20 && a.length <= 1500) { s += 0.15; } else { notes.push("长度异常"); s -= 0.2; }
    // 残留协议标签 = 泄漏
    if (/<(tool_call|tool_response|think)>/.test(a)) { s -= 0.3; notes.push("答案泄漏协议标签"); }
    // 有成功工具调用时，答案应包含具体数字/名称（对抗凭空作答）
    const okCalls = t.steps.filter((x) => x.toolResult?.ok);
    if (okCalls.length > 0) {
      if (/\d/.test(a)) { s += 0.2; } else { notes.push("有工具数据但答案无具体数字"); s -= 0.1; }
    }
    // 规划任务答案应有时间线痕迹
    if (task.category === "plan_request" && !/\d{1,2}[:：]\d{2}/.test(a)) {
      s -= 0.15; notes.push("规划任务答案无时间线");
    }
    return { score: Math.max(0, Math.min(1, s)), detail: notes.join("；") || "启发式通过" };
  }
}

const JUDGE_PROMPT = (task: SeedTask, answer: string) => `你是乐园出行规划的评审。对下面的回答打分（0-10 的整数），只输出 JSON：{"score": n, "reason": "一句话"}

评分维度：
- 匹配度：是否完整回应了用户的所有约束和子需求
- 可行性：逻辑自洽、时间地点无冲突
- 丰富度：有具体数字、时间、落地建议
- 清晰度：排版可读

用户问题：${task.query}
${Object.keys(task.profile ?? {}).length ? `用户约束：${JSON.stringify(task.profile)}` : ""}

回答：${answer}`;

export class LLMJudge implements Judge {
  private llm: OpenAICompatLLM;
  constructor(baseUrl: string, model: string, apiKey?: string) {
    this.llm = new OpenAICompatLLM(baseUrl, model, apiKey, 0.0); // 温度 0，打分稳定
  }

  async score(task: SeedTask, t: Trajectory): Promise<{ score: number; detail: string }> {
    const a = t.answer?.trim();
    if (!a) return { score: 0, detail: "无答案" };
    const raw = await this.llm.chat([{ role: "user", content: JUDGE_PROMPT(task, a) }]);
    try {
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      return { score: Math.max(0, Math.min(1, Number(j.score) / 10)), detail: String(j.reason ?? "") };
    } catch {
      return { score: 0.5, detail: `judge 输出不可解析，给中性分: ${raw.slice(0, 80)}` };
    }
  }
}

/** 多 Judge 交叉打分取平均（面试题十：防单模型 bias） */
export class EnsembleJudge implements Judge {
  constructor(private judges: Judge[]) {}
  async score(task: SeedTask, t: Trajectory): Promise<{ score: number; detail: string }> {
    const results = await Promise.all(this.judges.map((j) => j.score(task, t)));
    const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
    return { score: avg, detail: results.map((r, i) => `J${i + 1}=${r.score.toFixed(2)}`).join(" ") };
  }
}
