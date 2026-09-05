import { createHash } from "node:crypto";
import { buildSystemPrompt } from "../agent/prompt";
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
  version: "park-full-multiturn-v1";
  protocolHash: string;
  snapshotAt: string;
  name: string;
  model: string;
  n: number;
  date: string;
  metrics: Record<string, number>;
  perCategory: Record<string, { n: number; tool_em: number; reward_mean: number }>;
  perSample: { task: SeedTask; trajectory: Awaited<ReturnType<typeof runEpisode>> | null;
    reward: Awaited<ReturnType<typeof scoreTrajectory>> | null; error: string | null }[];
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
  if (!tasks.length) throw new Error("评测集不能为空");
  const caller = makeDirectCaller({ mode: "sandbox", snapshotAt:process.env.PARK_SNAPSHOT_AT });
  const judge = new HeuristicJudge();

  let answered = 0, formatClean = 0, toolEm = 0, halluc = 0, tookCalls = 0;
  let planTotal = 0, planPass = 0, rewardSum = 0;
  let logicalCalls=0, successfulCalls=0;
  const perCategory: EvalResult["perCategory"] = {};
  const perSample: EvalResult["perSample"] = [];

  for (const [i, task] of tasks.entries()) {
    if (task.category === "plan_request") planTotal++;
    const c = (perCategory[task.category] ??= { n: 0, tool_em: 0, reward_mean: 0 });
    c.n++;
    let traj;
    try {
      traj = await runEpisode(llm, { parkId: task.parkId, query: task.query + (Object.keys(task.profile).length ? `\n用户已确认的结构化偏好：${JSON.stringify(task.profile)}` : "") }, caller, { maxTurns: 30, maxToolCalls: 25, systemPrompt:buildSystemPrompt(task.parkId,process.env.PARK_SNAPSHOT_AT?.slice(0,10)) });
    } catch (e: any) {
      console.error(`[${i + 1}/${tasks.length}] episode failure on ${task.id}`);
      perSample.push({ task, trajectory: null, reward: null, error: "episode_failure" });
      continue;
    }
    const r = await scoreTrajectory(traj, task, judge, "mid");
    perSample.push({ task, trajectory: traj, reward: r,
      error: traj.stoppedReason === "llm_error" || traj.stoppedReason === "timeout" ? traj.stoppedReason : null });

    const emHit = r.trajectory >= 1;
    const isHalluc = task.category !== "no_tool" && traj.toolCallCount === 0 && traj.answer !== null;

    if (traj.stoppedReason === "answer" && !traj.answerRepaired) answered++;
    if (traj.steps.length > 0 && traj.formatErrorCount === 0) formatClean++;
    if (emHit) toolEm++;
    if (isHalluc) halluc++;
    const requests=traj.steps.filter(s=>s.parsed.toolCall&&s.toolResult);
    logicalCalls+=requests.length;
    successfulCalls+=requests.filter(s=>s.toolResult?.ok).length;
    tookCalls += traj.toolCallCount;
    rewardSum += r.total;
    if (task.category === "plan_request" && r.constraints === 1) planPass++;

    c.tool_em += emHit ? 1 : 0; c.reward_mean += r.total;

    console.error(`[${i + 1}/${tasks.length}] ${task.id} ${task.category} calls=${traj.toolCallCount} reward=${r.total.toFixed(2)}`);
  }

  const n = tasks.length;
  for (const c of Object.values(perCategory)) {
    c.tool_em = +(c.tool_em / c.n).toFixed(3);
    c.reward_mean = +(c.reward_mean / c.n).toFixed(3);
  }

  return {
    version: "park-full-multiturn-v1", snapshotAt:process.env.PARK_SNAPSHOT_AT??"unfrozen-smoke",
    protocolHash:createHash("sha256").update(JSON.stringify({tasks,prompts:tasks.map(t=>buildSystemPrompt(t.parkId,process.env.PARK_SNAPSHOT_AT?.slice(0,10))),snapshot:process.env.PARK_SNAPSHOT_AT,fixtures:process.env.PARK_SANDBOX_FIXTURES_ONLY??"0",phase:"mid",maxTurns:30,maxCalls:25})).digest("hex"), name, model, n, date: new Date().toISOString().slice(0, 10),
    metrics: {
      logical_tool_requests:logicalCalls,
      successful_tool_requests:successfulCalls,
      tool_success_rate:logicalCalls ? successfulCalls/logicalCalls : -1,
      answered: +(answered / n).toFixed(3),
      format_clean: +(formatClean / n).toFixed(3),
      tool_em: +(toolEm / n).toFixed(3),
      hallucination: +(halluc / n).toFixed(3),
      constraint_pass: planTotal ? +(planPass / planTotal).toFixed(3) : -1,
      avg_tool_calls: +(tookCalls / n).toFixed(2),
      reward_mean: +(rewardSum / n).toFixed(3),
    },
    perCategory, perSample,
  };
}

function printCompare() {
  if (!existsSync(OUT_DIR)) { console.log("还没有评测结果"); return; }
  const results: EvalResult[] = readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(OUT_DIR, f), "utf-8")))
    .filter(r => r.version === "park-full-multiturn-v1");
  if (!results.length) { console.log("没有v2结果；旧口径不能与最终行程校验分数混用"); return; }
  console.log("以下仅汇总同评分版本结果；仍须核对相同任务、prompt、快照与解码设置后才能推断训练提升。");

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
    const outPath = join(OUT_DIR, `${name}.json`);
    if (existsSync(outPath)) throw new Error("结果文件已存在，请使用新的--name，不能覆盖历史结果");
    const limit = Number(arg("limit", "50"));
    const seedsPath = arg("seeds", join(ROOT, "data", "rl", "seeds.jsonl"));

    const all: SeedTask[] = readFileSync(seedsPath, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    if(!process.env.PARK_SNAPSHOT_AT)throw new Error("正式评测必须冻结 PARK_SNAPSHOT_AT");
    const tasks = sampleTasks(all.filter(t=>t.split==="test"), limit);
    console.error(`评测 ${name}（${model}）: ${tasks.length} 任务（分层抽样）`);

    const llm = new OpenAICompatLLM(baseUrl, model, undefined, 0.3);
    const result = await evaluate(llm, tasks, name, model);

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2), { flag: "wx" });
    console.log(JSON.stringify(result.metrics, null, 2));
    console.log(`→ ${outPath}\n用 --compare 打印多模型对比表`);
  })();
}
