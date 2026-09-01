/**
 * 生成种子任务文件：模板种子 + 真实人类 query 合入 + 去重
 * 用法：npm run data:seeds   → data/rl/seeds.jsonl
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSeeds, loadHumanQueries, dedup } from "./seeds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "data", "rl", "seeds.jsonl");
const HUMAN = join(ROOT, "data", "rl", "human_queries.jsonl");

const template = generateSeeds("shanghai");
const human = loadHumanQueries(HUMAN);
const all = dedup([...human, ...template]); // 人类语料优先保留，模板撞车被去掉

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, all.map((t) => JSON.stringify(t)).join("\n") + "\n");

const byCat: Record<string, number> = {};
for (const t of all) byCat[t.category] = (byCat[t.category] ?? 0) + 1;
console.error(`模板 ${template.length} + 人类 ${human.length} → 去重后 ${all.length}`);
console.error(JSON.stringify(byCat, null, 2));
console.error(`→ ${OUT}`);
