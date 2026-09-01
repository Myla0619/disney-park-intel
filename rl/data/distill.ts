/**
 * 数据蒸馏：教师模型在沙箱环境跑完整轨迹
 *
 * 用法（需要 OpenAI 兼容的教师端点，如 DeepSeek / 阿里云百炼 / 自建 vLLM）：
 *   TEACHER_BASE_URL=https://api.deepseek.com/v1 \
 *   TEACHER_MODEL=deepseek-chat \
 *   LLM_API_KEY=sk-... \
 *   npx tsx rl/data/distill.ts [--limit 10] [--concurrency 4] [--seeds data/rl/seeds.jsonl]
 *
 * 输出 data/rl/trajectories/{date}.jsonl，每行一条完整轨迹（含任务元信息），
 * 供 clean.ts 清洗后转 SFT 格式。中断可续跑：已有 id 自动跳过。
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runEpisode, OpenAICompatLLM, makeDirectCaller } from "../agent/loop";
import type { SeedTask } from "./seeds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "data", "rl", "trajectories");

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

async function main() {
  const baseUrl = process.env.TEACHER_BASE_URL;
  const model = process.env.TEACHER_MODEL;
  if (!baseUrl || !model) {
    console.error("需要 TEACHER_BASE_URL / TEACHER_MODEL / LLM_API_KEY 环境变量");
    process.exit(1);
  }

  const seedsPath = arg("seeds", join(ROOT, "data", "rl", "seeds.jsonl"));
  const limit = Number(arg("limit", "999999"));
  const concurrency = Number(arg("concurrency", "4"));

  const tasks: SeedTask[] = readFileSync(seedsPath, "utf-8")
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);

  // 断点续跑：跳过已蒸馏的任务
  const done = new Set<string>();
  if (existsSync(outFile)) {
    for (const l of readFileSync(outFile, "utf-8").split("\n")) {
      if (l.trim()) done.add(JSON.parse(l).taskId);
    }
  }
  const todo = tasks.filter((t) => !done.has(t.id)).slice(0, limit);
  console.error(`共 ${tasks.length} 任务，已完成 ${done.size}，本次蒸馏 ${todo.length}（并发 ${concurrency}）`);

  const llm = new OpenAICompatLLM(baseUrl, model, undefined, 0.7);
  const caller = makeDirectCaller({ mode: "sandbox" });
  let ok = 0, fail = 0;

  // 简单并发池
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const task = queue.shift()!;
        try {
          const traj = await runEpisode(llm, { parkId: task.parkId, query: task.query }, caller, {
            maxTurns: 30, maxToolCalls: 20,
          });
          appendFileSync(outFile, JSON.stringify({
            taskId: task.id, category: task.category, source: task.source,
            difficultyHint: task.difficultyHint, query: task.query, profile: task.profile,
            parkId: task.parkId, teacher: model,
            answer: traj.answer, stoppedReason: traj.stoppedReason,
            toolCallCount: traj.toolCallCount, formatErrorCount: traj.formatErrorCount,
            answerRepaired: traj.answerRepaired,
            messages: traj.messages,
            toolResults: traj.steps.map((s) => ({ call: s.parsed.toolCall, ok: s.toolResult?.ok ?? null })),
          }) + "\n");
          ok++;
          console.error(`[${ok + fail}/${todo.length}] ok ${task.id} calls=${traj.toolCallCount} stop=${traj.stoppedReason}`);
        } catch (e: any) {
          fail++;
          console.error(`[${ok + fail}/${todo.length}] FAIL ${task.id}: ${e?.message}`);
        }
      }
    })
  );
  console.error(`完成: ${ok} 成功 / ${fail} 失败 → ${outFile}`);
}

main();
