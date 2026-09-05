/**
 * 轨迹清洗 → SFT 训练数据
 *
 * 三级漏斗（规则过滤 → 格式清洗 → 质量筛选），对应面试题四：
 *   1. 规则过滤：无 answer / LLM 报错 / 超时 / 格式错误过多 / 答案过短 / 答案非中文 → 丢弃（记录原因）
 *   2. 工具健康度：全部调用失败的轨迹丢弃；有失败但最终恢复的保留（宝贵的纠错样本——
 *      有意不学课程里"删除失败工具轮"的做法，恢复轨迹教的是失败感知能力）
 *   3. 格式清洗：剥离 assistant 消息中标签外的解释性废话（"希望对你有帮助"这类），
 *      防止 SFT 学会在协议标签外输出闲聊文本
 *   4. 难度分级：按工具调用次数打标 easy(1-3)/medium(4-10)/hard(>10)，供课程学习
 *   5. 样本加权：完美轨迹 weight=1.0；有格式补救/部分工具失败但恢复的 borderline 降权 0.6
 *   6. （可选 --judge）LLM-as-Judge 质量门：任务相关性/完整度/工具合理性打分，低分剔除
 *
 * 输出 LLaMA-Factory / ms-swift 通用的 sharegpt 风格：
 *   {"messages":[{"role":"system",...},...], "weight":1.0, "difficulty":"medium", ...}
 *
 * 用法：npx tsx rl/data/clean.ts [--in data/rl/trajectories/xxx.jsonl] [--out data/rl/sft/train.jsonl]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentStep } from "../agent/protocol";
import { rebuildTrajectoryFromMessages } from "../reward/rebuild";
import { needsPlan, verifyFinalPlan } from "../reward/plan-evidence";
import type { SeedTask } from "./seeds";
import type { ChatMessage } from "../agent/loop";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TRAJ_DIR = join(ROOT, "data", "rl", "trajectories");

export type TrajectoryRecord = {
  taskId: string; category: string; source: string; difficultyHint: string;
  query: string; parkId: string; teacher: string;
  profile?: SeedTask["profile"];
  answer: string | null; stoppedReason: string;
  toolCallCount: number; formatErrorCount: number; answerRepaired: boolean;
  messages: { role: string; content: string }[];
  toolResults: { call: { name: string } | null; ok: boolean | null }[];
};

export type SftSample = {
  messages: { role: string; content: string }[];
  weight: number;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  taskId: string;
  toolCallCount: number;
  quality: "pass" | "borderline";
};

export type CleanResult = {
  samples: SftSample[];
  rejected: { taskId: string; reason: string }[];
  stats: Record<string, number>;
};

const MIN_ANSWER_CHARS = 8;
const TAG_BLOCK = /<think>[\s\S]*?<\/think>|<tool_call>[\s\S]*?<\/tool_call>|<answer>[\s\S]*?<\/answer>/g;

function chineseChars(s: string): number {
  return (s.match(/[一-鿿]/g) ?? []).length;
}

/** 格式清洗：assistant 消息只保留协议标签块，剥离标签外的解释性废话 */
function stripOutsideTags(content: string): { cleaned: string; stripped: number } {
  const blocks = content.match(TAG_BLOCK);
  if (!blocks?.length) return { cleaned: content, stripped: 0 };
  const cleaned = blocks.join("\n");
  return { cleaned, stripped: Math.max(0, content.length - cleaned.length) };
}

export function cleanTrajectories(records: TrajectoryRecord[]): CleanResult {
  const samples: SftSample[] = [];
  const rejected: { taskId: string; reason: string }[] = [];

  let strippedTotal = 0;
  for (const t of records) {
    if (t.messages.some(m => m.role === "assistant" && m.content.includes("<tool_response>"))) {
      rejected.push({ taskId: t.taskId, reason: "assistant_forged_tool_response" });
      continue;
    }
    // 关卡 1：规则过滤
    if (t.stoppedReason === "llm_error") { rejected.push({ taskId: t.taskId, reason: "llm_error" }); continue; }
    if (t.stoppedReason === "timeout") { rejected.push({ taskId: t.taskId, reason: "timeout" }); continue; }
    if (!t.answer || !t.answer.trim()) { rejected.push({ taskId: t.taskId, reason: "no_answer" }); continue; }
    if (t.stoppedReason === "max_turns") { rejected.push({ taskId: t.taskId, reason: "max_turns_no_answer" }); continue; }
    const answer = t.answer.trim();
    if (answer.length < MIN_ANSWER_CHARS) { rejected.push({ taskId: t.taskId, reason: "answer_too_short" }); continue; }
    if (chineseChars(answer) < 2) { rejected.push({ taskId: t.taskId, reason: "answer_not_chinese" }); continue; }
    // 每步都出格式错的教不了格式：错误数 >= 步数
    const stepCount = Math.max(1, t.messages.filter((m) => m.role === "assistant").length);
    if (t.formatErrorCount >= stepCount) { rejected.push({ taskId: t.taskId, reason: "format_broken" }); continue; }

    if(t.category!=="no_tool"&&t.toolCallCount===0){rejected.push({taskId:t.taskId,reason:"required_tool_missing"});continue;}

    // 关卡 2：工具健康度
    const calls = t.toolResults.filter((x) => x.call !== null);
    const failedCalls = calls.filter((x) => x.ok === false).length;
    if (calls.length > 0 && failedCalls === calls.length) {
      rejected.push({ taskId: t.taskId, reason: "all_tools_failed" });
      continue;
    }

    // 关卡 3：难度分级（课程学习用）
    const difficulty: SftSample["difficulty"] =
      t.toolCallCount <= 3 ? "easy" : t.toolCallCount <= 10 ? "medium" : "hard";

    // 关卡 3.5：格式清洗——剥离 assistant 消息中标签外的废话文本
    const cleanedMessages = t.messages.map((m) => {
      if (m.role !== "assistant") return m;
      const { cleaned, stripped } = stripOutsideTags(m.content);
      strippedTotal += stripped;
      return { ...m, content: cleaned };
    });
    if (cleanedMessages.some(m => m.role === "assistant" && parseAgentStep(m.content).errors.length > 0)) {
      rejected.push({ taskId: t.taskId, reason: "invalid_assistant_protocol" });
      continue;
    }

    const rebuilt = rebuildTrajectoryFromMessages(cleanedMessages as ChatMessage[]);
    if (needsPlan(rebuilt, t)) {
      if (!t.profile) {
        rejected.push({ taskId: t.taskId, reason: "missing_plan_profile" });
        continue;
      }
      const task: SeedTask = { id: t.taskId, query: t.query, parkId: t.parkId,
        category: t.category, profile: t.profile, source: "template", difficultyHint: difficulty };
      if (!verifyFinalPlan(rebuilt, task).passed) {
        rejected.push({ taskId: t.taskId, reason: "invalid_final_plan" });
        continue;
      }
    }

    // 关卡 4：加权。完美 = 无格式错误、无补救、无失败调用
    const perfect = t.formatErrorCount === 0 && !t.answerRepaired && failedCalls === 0;
    samples.push({
      messages: cleanedMessages,
      weight: perfect ? 1.0 : 0.6,
      quality: perfect ? "pass" : "borderline",
      difficulty, category: t.category, taskId: t.taskId, toolCallCount: t.toolCallCount,
    });
  }

  const stats: Record<string, number> = {
    total: records.length, kept: samples.length, rejected: rejected.length,
    pass: samples.filter((s) => s.quality === "pass").length,
    borderline: samples.filter((s) => s.quality === "borderline").length,
    easy: samples.filter((s) => s.difficulty === "easy").length,
    medium: samples.filter((s) => s.difficulty === "medium").length,
    hard: samples.filter((s) => s.difficulty === "hard").length,
    stripped_chars: strippedTotal,
  };
  for (const rej of rejected) stats[`rej_${rej.reason}`] = (stats[`rej_${rej.reason}`] ?? 0) + 1;

  return { samples, rejected, stats };
}

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

// CLI 入口（被 import 时不执行）
// 可选 LLM-as-Judge 质量门：--judge（需 TEACHER_BASE_URL/TEACHER_MODEL/LLM_API_KEY，
// 或 JUDGE_BASE_URL/JUDGE_MODEL）。规则过滤是免费的第一道，Judge 是花钱的最后一道。
if (process.argv[1] && process.argv[1].endsWith("clean.ts")) {
  (async () => {
    const inArg = arg("in", "");
    const files = inArg
      ? [inArg]
      : existsSync(TRAJ_DIR) ? readdirSync(TRAJ_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => join(TRAJ_DIR, f)) : [];
    if (!files.length) { console.error("没有轨迹文件，先跑 distill.ts"); process.exit(1); }

    const attempts: TrajectoryRecord[] = files.flatMap((f) =>
      readFileSync(f, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    );
    // Prefer the latest successful attempt; never duplicate a resumed task in SFT.
    const unique = new Map<string,TrajectoryRecord>();
    for(const r of attempts)if(!unique.has(r.taskId)||r.stoppedReason==="answer")unique.set(r.taskId,r);
    const records=[...unique.values()];
    const { samples, stats, rejected } = cleanTrajectories(records);

    let kept = samples;
    if (process.argv.includes("--judge")) {
      const baseUrl = process.env.JUDGE_BASE_URL ?? process.env.TEACHER_BASE_URL;
      const model = process.env.JUDGE_MODEL ?? process.env.TEACHER_MODEL;
      if (!baseUrl || !model) { console.error("--judge 需要 JUDGE_/TEACHER_ 端点环境变量"); process.exit(1); }
      const { LLMJudge } = await import("../reward/judge");
      const judge = new LLMJudge(baseUrl, model);
      const byId = new Map(records.map((r) => [r.taskId, r]));
      kept = [];
      for (const s of samples) {
        const rec = byId.get(s.taskId)!;
        const { score, detail } = await judge.score(
          { id: s.taskId, parkId: rec.parkId, category: s.category, query: rec.query,
            profile: (rec as any).profile ?? {}, source: "template", difficultyHint: rec.difficultyHint as any },
          { answer: rec.answer, messages: rec.messages } as any
        );
        if (score < 0.35) {
          stats["rej_judge_low"] = (stats["rej_judge_low"] ?? 0) + 1;
          rejected.push({taskId:s.taskId,reason:"judge_low"});
          console.error(`[judge] drop ${s.taskId} score=${score.toFixed(2)} ${detail}`);
          continue;
        }
        if (score < 0.6 && s.weight > 0.6) { s.weight = 0.6; s.quality = "borderline"; }
        kept.push(s);
      }
      stats.kept_after_judge = kept.length;
    }

    const outPath = arg("out", join(ROOT, "data", "rl", "sft", "train.jsonl"));
    mkdirSync(dirname(outPath), { recursive: true });
    // 课程学习顺序：easy → medium → hard 排列（训练框架按顺序喂或按 difficulty 字段分阶段）
    const order = { easy: 0, medium: 1, hard: 2 };
    kept.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    writeFileSync(outPath+".rejected.json",JSON.stringify(rejected,null,2));
    writeFileSync(outPath+".manifest.json",JSON.stringify({...stats,kept:kept.length,rejected:rejected.length},null,2));
    writeFileSync(outPath, kept.map((s) => JSON.stringify(s)).join("\n") + "\n");

    console.error(JSON.stringify(stats, null, 2));
    console.error(`→ ${outPath}`);
  })();
}
