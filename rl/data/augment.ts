/**
 * Query 扩增：教师模型把每条种子改写成 N 个变体（表述风格/语气/细节变化），
 * 约束组合不变（profile 原样继承），改写后再过一遍 3-gram 去重。
 *
 * 目标：~300 种子 → 1500+ 任务。
 *
 * 用法（需要教师端点）：
 *   TEACHER_BASE_URL=... TEACHER_MODEL=... LLM_API_KEY=... \
 *   npx tsx rl/data/augment.ts [--variants 4] [--limit 999]
 * 输出：data/rl/seeds_augmented.jsonl（含原种子）
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenAICompatLLM } from "../agent/loop";
import { dedup, type SeedTask } from "./seeds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const STYLE_HINTS = [
  "口语化，像发微信问朋友",
  "小红书笔记评论区的语气，可以带点表情词",
  "非常简短，能省则省",
  "详细描述自己的情况，句子偏长",
];

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

async function main() {
  const baseUrl = process.env.TEACHER_BASE_URL;
  const model = process.env.TEACHER_MODEL;
  if (!baseUrl || !model) {
    console.error("需要 TEACHER_BASE_URL / TEACHER_MODEL / LLM_API_KEY");
    process.exit(1);
  }
  const variants = Number(arg("variants", "4"));
  const limit = Number(arg("limit", "999999"));

  const seeds: SeedTask[] = readFileSync(join(ROOT, "data", "rl", "seeds.jsonl"), "utf-8")
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).slice(0, limit);

  const llm = new OpenAICompatLLM(baseUrl, model, undefined, 0.9);
  const out: SeedTask[] = [...seeds];

  for (const [i, seed] of seeds.entries()) {
    const styles = STYLE_HINTS.slice(0, variants);
    const prompt = `把下面这句游客咨询改写成 ${styles.length} 个不同版本。要求：
1. 意思和约束完全不变（提到的项目、人数、时间、身高等信息必须保留）
2. 每个版本用不同风格：${styles.map((s, j) => `版本${j + 1}=${s}`).join("；")}
3. 只输出 JSON 数组，如 ["版本1","版本2",...]

原句：${seed.query}`;
    try {
      const raw = await llm.chat([{ role: "user", content: prompt }]);
      const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)) as string[];
      arr.slice(0, variants).forEach((q, j) => {
        if (typeof q === "string" && q.trim()) {
          out.push({ ...seed, id: `${seed.id}-v${j + 1}`, query: q.trim() });
        }
      });
      console.error(`[${i + 1}/${seeds.length}] ${seed.id} +${arr.length}`);
    } catch (e: any) {
      console.error(`[${i + 1}/${seeds.length}] FAIL ${seed.id}: ${e?.message}`);
    }
  }

  const deduped = dedup(out);
  const outPath = join(ROOT, "data", "rl", "seeds_augmented.jsonl");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, deduped.map((t) => JSON.stringify(t)).join("\n") + "\n");
  console.error(`${seeds.length} 种子 → 扩增去重后 ${deduped.length} → ${outPath}`);
}

main();
