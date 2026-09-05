/** Build a reproducible, constraint-aware 306-family corpus before augmentation. */
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSeeds, loadHumanQueries, type SeedTask } from "./seeds";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function buildCorpus(target = 306): SeedTask[] {
  const pools = new Map<string, SeedTask[]>();
  const seen = new Set<string>();
  const human = loadHumanQueries(join(ROOT, "data/rl/human_queries.jsonl"));
  for (const t of [...human, ...Array.from({length: 30}, (_, i) => generateSeeds("shanghai", 20260901 + i)).flat()]) {
    // Exact identical wording cannot encode conflicting hidden profiles.
    const key = t.query.replace(/\s/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const pool = pools.get(t.category) ?? [];
    pool.push(t); pools.set(t.category, pool);
  }
  const selected: SeedTask[] = [];
  while (selected.length < target) {
    let added = false;
    for (const pool of pools.values()) {
      if (selected.length === target) break;
      const task = pool.shift();
      if (task) { selected.push(task); added = true; }
    }
    if (!added) throw new Error("Insufficient distinct task coverage");
  }
  const byCat = new Map<string, SeedTask[]>();
  for (const t of selected) {
    const familyId = `park-${hash(JSON.stringify([t.parkId,t.category,t.query,t.profile])).slice(0,16)}`;
    const item = {...t, id: familyId, familyId};
    const bucket = byCat.get(t.category) ?? []; bucket.push(item); byCat.set(t.category,bucket);
  }
  return [...byCat.values()].flatMap(bucket => {
    bucket.sort((a,b) => hash(a.id).localeCompare(hash(b.id)));
    const holdout = Math.max(1, Math.floor(bucket.length * 0.1));
    return bucket.map((t,i) => ({...t, split: (i < holdout ? "test" : i < holdout*2 ? "validation" : "train") as SeedTask["split"]}));
  });
}
if (process.argv[1]?.endsWith("gen_seeds.ts")) {
  const tasks = buildCorpus();
  const output = join(ROOT,"data/rl/seeds.jsonl");
  const content = tasks.map(t=>JSON.stringify(t)).join("\n")+"\n";
  mkdirSync(dirname(output),{recursive:true}); writeFileSync(output,content);
  const count = (key: keyof SeedTask) => tasks.reduce((a,t)=>{const k=String(t[key]);a[k]=(a[k]??0)+1;return a;},{} as Record<string,number>);
  const manifest = {schema:"park-corpus-v1",seedFamilies:tasks.length,sha256:hash(content),categories:count("category"),splits:count("split"),sources:count("source"),augmentationStatus:"not_run",trajectoryStatus:"not_run"};
  writeFileSync(join(ROOT,"data/rl/corpus-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log(JSON.stringify(manifest,null,2));
}
