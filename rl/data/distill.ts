import { createHash } from "node:crypto";
import { buildSystemPrompt } from "../agent/prompt";
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

  const seedsPath = arg("seeds", join(ROOT, "data", "rl", "seeds_augmented.jsonl"));
  const limit = Number(arg("limit", "999999"));
  const concurrency = Number(arg("concurrency", "4"));

  const tasks: SeedTask[] = readFileSync(seedsPath, "utf-8")
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = arg("out", join(OUT_DIR, "teacher-full.jsonl"));
  const snapshotAt = process.env.PARK_SNAPSHOT_AT;
  if (!snapshotAt) throw new Error("Freeze PARK_SNAPSHOT_AT before distillation");
  const identity = JSON.stringify({model, baseUrl, snapshotAt,
    inputHash: createHash("sha256").update(readFileSync(seedsPath)).digest("hex"), protocol:"park-full-multiturn-v1"});
  if (existsSync(outFile+".run.json") && readFileSync(outFile+".run.json","utf8") !== identity)
    throw new Error("Distillation resume mismatch; use a new output file");
  mkdirSync(dirname(outFile), {recursive:true});
  writeFileSync(outFile+".run.json", identity);

  // 断点续跑：跳过已蒸馏的任务
  const done = new Set<string>();
  if (existsSync(outFile)) {
    for (const l of readFileSync(outFile, "utf-8").split("\n")) {
      if (l.trim()) { const row=JSON.parse(l); if(row.stoppedReason==="answer"&&row.answer)done.add(row.taskId); }
    }
  }
  const todo = tasks.filter((t) => !done.has(t.id)).slice(0, limit);
  console.error(`共 ${tasks.length} 任务，已完成 ${done.size}，本次蒸馏 ${todo.length}（并发 ${concurrency}）`);

  const llm = new OpenAICompatLLM(baseUrl, model, undefined, 0.7);
  const caller = makeDirectCaller({ mode: "sandbox", snapshotAt });
  let ok = 0, fail = 0;

  // 简单并发池
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const task = queue.shift()!;
        try {
          const traj = await runEpisode(llm, { parkId: task.parkId, query: task.query + (Object.keys(task.profile).length ? `\n用户已确认的结构化偏好：${JSON.stringify(task.profile)}` : "") }, caller, {
            maxTurns: 30, maxToolCalls: 25, systemPrompt: buildSystemPrompt(task.parkId,snapshotAt.slice(0,10)),
          });
          appendFileSync(outFile, JSON.stringify({
            taskId: task.id, familyId:task.familyId, split:task.split, snapshotAt, category: task.category, source: task.source,
            difficultyHint: task.difficultyHint, query: task.query, profile: task.profile,
            parkId: task.parkId, teacher: model,
            answer: traj.answer, stoppedReason: traj.stoppedReason,
            toolCallCount: traj.toolCallCount, formatErrorCount: traj.formatErrorCount,
            answerRepaired: traj.answerRepaired,
            messages: traj.messages,
            toolResults: traj.steps.map((s) => ({ call: s.parsed.toolCall, ok: s.toolResult?.ok ?? null })),
          }) + "\n");
          if(traj.stoppedReason==="answer"&&traj.answer)ok++; else fail++;
          console.error(`[${ok + fail}/${todo.length}] ok ${task.id} calls=${traj.toolCallCount} stop=${traj.stoppedReason}`);
        } catch (e: any) {
          fail++;
          console.error(`[${ok + fail}/${todo.length}] FAIL ${task.id}: ${e?.message}`);
        }
      }
    })
  );
  const rows=readFileSync(outFile,"utf8").trim().split("\n").map(l=>JSON.parse(l));
  const latest=new Map(rows.map(r=>[r.taskId,r]));
  writeFileSync(outFile+".manifest.json",JSON.stringify({totalTasks:tasks.length,
    attempted:latest.size,answered:[...latest.values()].filter(r=>r.stoppedReason==="answer"&&r.answer).length,
    identity:JSON.parse(identity)},null,2));
  console.error(`完成: ${ok} 成功 / ${fail} 失败 → ${outFile}`);
}

main();
