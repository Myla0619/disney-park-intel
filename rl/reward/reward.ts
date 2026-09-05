/**
 * 6 维组合 Reward（对应面试题七/八）
 *
 * 过程维度（5 个结构化，全部 rule-based）：
 *   1. format        格式规范：标签闭合、JSON 合法、无格式漂移
 *   2. trajectory    工具轨迹合理性：该调的调了、不该调的没调（按任务类别判定）
 *   3. efficiency    工具效率：冗余调用惩罚（重复调用、超出难度预期）
 *   4. constraints   硬约束校验（可验证奖励 RL/VR）：复用 constraints.ts，无法被话术 hack
 *   5. callStatus    调用状态：失败率惩罚 + 失败后恢复不清零（保留纠错激励）
 * 结果维度（1 个）：
 *   6. answer        答案质量：可插拔 Judge（离线启发式 / 在线多模型交叉打分）
 *
 * 防 hack 设计：每维有界 [0,1]；多目标组合；过程+结果兼看；KL 约束在训练器侧
 * （veRL 配置），不在本模块。
 *
 * 课程式权重：early 结构化占比大（先学格式和工具），late 答案质量 ≥60%。
 */

import type { Trajectory } from "../agent/loop";
import type { SeedTask } from "../data/seeds";
import type { Judge } from "./judge";
import { needsPlan, verifyFinalPlan } from "./plan-evidence";

export type RewardBreakdown = {
  format: number;
  trajectory: number;
  efficiency: number;
  constraints: number;
  callStatus: number;
  answer: number;
  total: number;
  phase: CurriculumPhase;
  detail: Record<string, string>;
};

export type CurriculumPhase = "early" | "mid" | "late";

/** 课程式权重：结构化 → 答案质量 逐步让渡；late 阶段答案 ≥60%（大原则） */
export const PHASE_WEIGHTS: Record<CurriculumPhase, Record<string, number>> = {
  early: { format: 0.10, trajectory: 0.08, efficiency: 0.05, constraints: 0.12, callStatus: 0.05, answer: 0.60 },
  mid:   { format: 0.06, trajectory: 0.06, efficiency: 0.04, constraints: 0.12, callStatus: 0.04, answer: 0.68 },
  late:  { format: 0.04, trajectory: 0.04, efficiency: 0.03, constraints: 0.12, callStatus: 0.02, answer: 0.75 },
};

/** 任务类别 → 期望调用的工具（轨迹合理性判定表） */
const EXPECTED_TOOLS: Record<string, string[]> = {
  explicit_wait: ["get_wait_times"],
  implicit_wait: ["get_wait_times"],
  review_quality: ["search_reviews"],
  review_specific: ["search_reviews"],
  plan_request: ["plan_itinerary"],
  spot_info: ["get_spot_info", "walk_time"],
  weather_dependent: ["get_weather"],
  edge_negation: ["search_reviews", "get_wait_times"],
  edge_name_variant: ["get_wait_times", "search_reviews", "get_spot_info"],
  edge_multi_intent: [], // 特判：要求 >=2 种不同工具
  trade_off: [],         // 特判：权衡题必须查数据再算账——要求 >=2 种不同工具（如排队+步行/规划）
  no_tool: [],           // 特判：要求 0 次调用
  human: [],             // 真实语料类别未知，轨迹维度给中性分
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ── 各维度打分 ────────────────────────────────────────────────────────────────

function scoreFormat(t: Trajectory): [number, string] {
  const steps = Math.max(1, t.steps.length);
  const errRate = t.formatErrorCount / steps;
  let s = 1 - errRate;
  if (t.answerRepaired) s -= 0.2; // 补救成功但仍是格式缺陷
  if (t.answer === null) s -= 0.3; // 没产出答案本身是格式/收敛失败
  return [clamp01(s), `格式错误率 ${(errRate * 100).toFixed(0)}%${t.answerRepaired ? "，answer 补救" : ""}`];
}

function scoreTrajectorySanity(t: Trajectory, task: SeedTask): [number, string] {
  const called = t.steps.filter((s) => s.parsed.toolCall).map((s) => s.parsed.toolCall!.name);
  const distinct = new Set(called);

  if (task.category === "no_tool") {
    // 常识题不该调工具：调了就扣，直接答满分
    return called.length === 0 ? [1, "常识题未调工具，正确"] : [clamp01(1 - 0.4 * called.length), `常识题却调了 ${called.length} 次工具`];
  }
  if (task.category === "edge_multi_intent" || task.category === "trade_off") {
    if (called.length === 0) return [0, "该查数据却直接作答（疑似编造）"];
    return distinct.size >= 2 ? [1, `用了 ${distinct.size} 种工具做权衡/多意图`] : [0.4, "只用了一种工具，权衡依据不足"];
  }
  const expected = EXPECTED_TOOLS[task.category] ?? [];
  if (expected.length === 0) return [0.7, "类别无明确期望，给中性分"]; // human 等
  const hit = expected.some((e) => distinct.has(e));
  if (!hit && called.length === 0) return [0, "该调工具却直接作答（疑似编造）"];
  return hit ? [1, `命中期望工具 ${expected.filter((e) => distinct.has(e)).join(",")}`] : [0.3, `未命中期望工具（期望 ${expected.join("/")}，实际 ${[...distinct].join(",") || "无"}）`];
}

function scoreEfficiency(t: Trajectory, task: SeedTask): [number, string] {
  const calls = t.steps.filter((s) => s.parsed.toolCall);
  if (calls.length === 0) return [task.category === "no_tool" ? 1 : 0.5, "无调用"];

  // 完全相同的重复调用（同名同参）
  const sigs = calls.map((s) => JSON.stringify([s.parsed.toolCall!.name, s.parsed.toolCall!.arguments]));
  const dupes = sigs.length - new Set(sigs).size;

  // 超出难度预期的冗余（预期上限：easy 4 / medium 12 / hard 20）
  const cap = task.difficultyHint === "easy" ? 4 : task.difficultyHint === "medium" ? 12 : 20;
  const overshoot = Math.max(0, calls.length - cap);

  const s = 1 - 0.2 * dupes - 0.1 * overshoot;
  return [clamp01(s), `${calls.length} 次调用，重复 ${dupes}，超预期 ${overshoot}`];
}

function scoreConstraints(t: Trajectory, task: SeedTask): [number, string] {
  if (!needsPlan(t, task)) return [1, "非规划任务，无硬约束对象"];
  const result = verifyFinalPlan(t, task);
  return [result.score, result.detail];
}

function scoreCallStatus(t: Trajectory): [number, string] {
  const calls = t.steps.filter((s) => s.parsed.toolCall && s.toolResult);
  if (calls.length === 0) return [1, "无调用"];
  const failed = calls.filter((s) => s.toolResult!.ok === false);
  // 失败后若后续同名调用成功 = 恢复，减半惩罚（纠错是想要的行为）
  let penalty = 0;
  for (const f of failed) {
    const idx = t.steps.indexOf(f);
    const name = f.parsed.toolCall!.name;
    const recovered = t.steps.slice(idx + 1).some((s) => s.parsed.toolCall?.name === name && s.toolResult?.ok);
    penalty += recovered ? 0.1 : 0.25;
  }
  return [clamp01(1 - penalty), `${failed.length}/${calls.length} 次失败`];
}

// ── 组合入口 ─────────────────────────────────────────────────────────────────

export async function scoreTrajectory(
  t: Trajectory,
  task: SeedTask,
  judge: Judge,
  phase: CurriculumPhase = "mid"
): Promise<RewardBreakdown> {
  const [format, dFormat] = scoreFormat(t);
  const [trajectory, dTraj] = scoreTrajectorySanity(t, task);
  const [efficiency, dEff] = scoreEfficiency(t, task);
  const [constraints, dCons] = scoreConstraints(t, task);
  const [callStatus, dCall] = scoreCallStatus(t);
  const { score: answer, detail: dAns } = await judge.score(task, t);

  const w = PHASE_WEIGHTS[phase];
  const rawTotal = clamp01(
    w.format * format + w.trajectory * trajectory + w.efficiency * efficiency +
    w.constraints * constraints + w.callStatus * callStatus + w.answer * clamp01(answer)
  );
  // Invalid plans cannot buy a high score with formatting or Judge prose.
  // Keep partial feedback but cap all infeasible/unverified plans below valid ones.
  const planFailed = needsPlan(t, task) && constraints < 1;
  const total = planFailed ? 0 : rawTotal;

  return {
    format, trajectory, efficiency, constraints, callStatus, answer: clamp01(answer), total, phase,
    detail: { format: dFormat, trajectory: dTraj, efficiency: dEff, constraints: dCons, callStatus: dCall, answer: dAns,
      feasibility_gate: planFailed ? "不可行/未验证规划总分为0" : "not capped" },
  };
}
