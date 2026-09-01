/**
 * 轨迹清洗 → SFT 训练数据
 *
 * 四道关卡（对应面试题四的清洗策略）：
 *   1. 硬过滤：没有 answer / LLM 报错 / 格式错误过多 → 直接丢弃（记录原因）
 *   2. 工具健康度：工具调用全失败的轨迹丢弃；有失败但最终恢复的保留（这是宝贵的纠错样本）
 *   3. 难度分级：按工具调用次数打标 easy(1-3)/medium(4-10)/hard(>=10)，供课程学习
 *   4. 样本加权：完美轨迹 weight=1.0；有格式补救/部分工具失败但恢复的 borderline 降权 0.6
 *
 * 输出 LLaMA-Factory / ms-swift 通用的 sharegpt 风格：
 *   {"messages":[{"role":"system",...},...], "weight":1.0, "difficulty":"medium", ...}
 *
 * 用法：npx tsx rl/data/clean.ts [--in data/rl/trajectories/xxx.jsonl] [--out data/rl/sft/train.jsonl]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TRAJ_DIR = join(ROOT, "data", "rl", "trajectories");

export type TrajectoryRecord = {
  taskId: string; category: string; source: string; difficultyHint: string;
  query: string; parkId: string; teacher: string;
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

export function cleanTrajectories(records: TrajectoryRecord[]): CleanResult {
  const samples: SftSample[] = [];
  const rejected: { taskId: string; reason: string }[] = [];

  for (const t of records) {
    // 关卡 1：硬过滤
    if (t.stoppedReason === "llm_error") { rejected.push({ taskId: t.taskId, reason: "llm_error" }); continue; }
    if (!t.answer || !t.answer.trim()) { rejected.push({ taskId: t.taskId, reason: "no_answer" }); continue; }
    if (t.stoppedReason === "max_turns") { rejected.push({ taskId: t.taskId, reason: "max_turns_no_answer" }); continue; }
    // 每步都出格式错的教不了格式：错误数 >= 步数
    const stepCount = Math.max(1, t.messages.filter((m) => m.role === "assistant").length);
    if (t.formatErrorCount >= stepCount) { rejected.push({ taskId: t.taskId, reason: "format_broken" }); continue; }

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

    // 关卡 4：加权。完美 = 无格式错误、无补救、无失败调用
    const perfect = t.formatErrorCount === 0 && !t.answerRepaired && failedCalls === 0;
    samples.push({
      messages: t.messages,
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
  };
  for (const rej of rejected) stats[`rej_${rej.reason}`] = (stats[`rej_${rej.reason}`] ?? 0) + 1;

  return { samples, rejected, stats };
}

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

// CLI 入口（被 import 时不执行）
if (process.argv[1] && process.argv[1].endsWith("clean.ts")) {
  const inArg = arg("in", "");
  const files = inArg
    ? [inArg]
    : existsSync(TRAJ_DIR) ? readdirSync(TRAJ_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => join(TRAJ_DIR, f)) : [];
  if (!files.length) { console.error("没有轨迹文件，先跑 distill.ts"); process.exit(1); }

  const records: TrajectoryRecord[] = files.flatMap((f) =>
    readFileSync(f, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
  );
  const { samples, stats } = cleanTrajectories(records);

  const outPath = arg("out", join(ROOT, "data", "rl", "sft", "train.jsonl"));
  mkdirSync(dirname(outPath), { recursive: true });
  // 课程学习顺序：easy → medium → hard 排列（训练框架按顺序喂或按 difficulty 字段分阶段）
  const order = { easy: 0, medium: 1, hard: 2 };
  samples.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
  writeFileSync(outPath, samples.map((s) => JSON.stringify(s)).join("\n") + "\n");

  console.error(JSON.stringify(stats, null, 2));
  console.error(`→ ${outPath}`);
}
