/**
 * 评测运行器：对任意 OpenAI 兼容端点跑评测集，产出指标表
 *
 * 三方对比（base / SFT / SFT+RL）和教师基线都用这一个入口，
 * 不用 GPU——被测模型是远端端点，环境全程沙箱。
 *
 * 用法：
 *   EVAL_BASE_URL=https://api.deepseek.com/v1 EVAL_MODEL=deepseek-chat LLM_API_KEY=sk-... \
 *     npx tsx rl/eval/run_eval.ts --name deepseek-baseline --limit 50
 *   npx tsx rl/eval/run_eval.ts --compare            # 打印已有结果对比表
 *
 * 指标（全部可复现）：
 *   answered        正常产出 <answer> 的比例（无补救）
 *   format_clean    全程零格式错误的比例
 *   tool_em         工具选择命中率（按任务类别的期望工具判定，含 no_tool 的不调用）
 *   hallucination   该调工具却凭空作答的比例（越低越好）
 *   constraint_pass 规划任务硬约束全过比例（程序化校验）
 *   avg_tool_calls  平均工具调用次数
 *   reward_mean     6 维组合 reward 均值（HeuristicJudge，mid 阶段权重）
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runEpisode, OpenAICompatLLM, makeDirectCaller, type LLM } from "../agent/loop";
import { scoreTrajectory } from "../reward/reward";
import { HeuristicJudge } from "../reward/judge";
import type { SeedTask } from "../data/seeds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "data", "rl", "eval");

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

export type EvalResult = {
  name: string;
  model: string;
  n: number;
  date: string;
  metrics: Record<string, number>;
  perCategory: Record<string, { n: number; tool_em: number; reward_mean: number }>;
};

/** 分层抽样：每类按比例取，保证小类别不被淹没 */
export function sampleTasks(tasks: SeedTask[], limit: number): SeedTask[] {
  if (tasks.length <= limit) return tasks;
  const byCat = new Map<string, SeedTask[]>();
  for (const t of tasks) {
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category)!.push(t);
  }
  const out: SeedTask[] = [];
  const perCat = Math.max(1, Math.floor(limit / byCat.size));
  for (const list of byCat.values()) out.push(...list.slice(0, perCat));
  return out.slice(0, limit);
}

export async function evaluate(llm: LLM, tasks: SeedTask[], name: string, model: string): Promise<EvalResult> {
  const caller = makeDirectCaller({ mode: "sandbox" });
  const judge = new HeuristicJudge();

  let answered = 0, formatClean = 0, toolEm = 0, halluc = 0, tookCalls = 0;
  let planTotal = 0, planPass = 0, rewardSum = 0;
  const perCategory: EvalResult["perCategory"] = {};

  for (const [i, task] of tasks.entries()) {
    let traj;
    try {
      traj = await runEpisode(llm, { parkId: task.parkId, query: task.query }, caller, { maxTurns: 20, maxToolCalls: 15 });
    } catch (e: any) {
      console.error(`[${i + 1}/${tasks.length}] LLM error on ${task.id}: ${e?.message}`);
      continue;
    }
    const r = await scoreTrajectory(traj, task, judge, "mid");

    const emHit = r.trajectory >= 1;
    const isHalluc = task.category !== "no_tool" && traj.toolCallCount === 0 && traj.answer !== null;

    if (traj.stoppedReason === "answer" && !traj.answerRepaired) answered++;
    if (traj.formatErrorCount === 0) formatClean++;
    if (emHit) toolEm++;
    if (isHalluc) halluc++;
    tookCalls += traj.toolCallCount;
    rewardSum += r.total;
    if (task.category === "plan_request") { planTotal++; if (r.constraints === 1) planPass++; }

    const c = (perCategory[task.category] ??= { n: 0, tool_em: 0, reward_mean: 0 });
    c.n++; c.tool_em += emHit ? 1 : 0; c.reward_mean += r.total;

    console.error(`[${i + 1}/${tasks.length}] ${task.id} ${task.category} calls=${traj.toolCallCount} reward=${r.total.toFixed(2)}`);
  }

  const n = tasks.length;
  for (const c of Object.values(perCategory)) {
    c.tool_em = +(c.tool_em / c.n).toFixed(3);
    c.reward_mean = +(c.reward_mean / c.n).toFixed(3);
  }

  return {
    name, model, n, date: new Date().toISOString().slice(0, 10),
    metrics: {
      answered: +(answered / n).toFixed(3),
      format_clean: +(formatClean / n).toFixed(3),
      tool_em: +(toolEm / n).toFixed(3),
      hallucination: +(halluc / n).toFixed(3),
      constraint_pass: planTotal ? +(planPass / planTotal).toFixed(3) : -1,
      avg_tool_calls: +(tookCalls / n).toFixed(2),
      reward_mean: +(rewardSum / n).toFixed(3),
    },
    perCategory,
  };
}

function printCompare() {
  if (!existsSync(OUT_DIR)) { console.log("还没有评测结果"); return; }
  const results: EvalResult[] = readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(OUT_DIR, f), "utf-8")));
  if (!results.length) { console.log("还没有评测结果"); return; }

  const keys = ["answered", "format_clean", "tool_em", "hallucination", "constraint_pass", "avg_tool_calls", "reward_mean"];
  console.log(`| 指标 | ${results.map((r) => r.name).join(" | ")} |`);
  console.log(`|---|${results.map(() => "---").join("|")}|`);
  for (const k of keys) {
    console.log(`| ${k} | ${results.map((r) => r.metrics[k] ?? "-").join(" | ")} |`);
  }
  console.log(`\n(n = ${results.map((r) => `${r.name}:${r.n}`).join(", ")})`);
}

// CLI
if (process.argv[1]?.endsWith("run_eval.ts")) {
  (async () => {
    if (process.argv.includes("--compare")) { printCompare(); return; }

    const baseUrl = process.env.EVAL_BASE_URL;
    const model = process.env.EVAL_MODEL;
    if (!baseUrl || !model) {
      console.error("需要 EVAL_BASE_URL / EVAL_MODEL / LLM_API_KEY 环境变量（或 --compare 看已有结果）");
      process.exit(1);
    }
    const name = arg("name", model.replace(/[^a-zA-Z0-9-]/g, "-"));
    const limit = Number(arg("limit", "50"));
    const seedsPath = arg("seeds", join(ROOT, "data", "rl", "seeds.jsonl"));

    const all: SeedTask[] = readFileSync(seedsPath, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const tasks = sampleTasks(all, limit);
    console.error(`评测 ${name}（${model}）: ${tasks.length} 任务（分层抽样）`);

    const llm = new OpenAICompatLLM(baseUrl, model, undefined, 0.3);
    const result = await evaluate(llm, tasks, name, model);

    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = join(OUT_DIR, `${name}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.metrics, null, 2));
    console.log(`→ ${outPath}\n用 --compare 打印多模型对比表`);
  })();
}
