#!/usr/bin/env node
/**
 * 采集 Queue-Times 的排队快照，追加到 data/wait-snapshots/YYYY-MM.jsonl。
 *
 * 由 .github/workflows/collect-wait-times.yml 定时运行并提交结果。快照随仓库
 * 一起版本化，任何人 clone 下来都能复现 src/lib/wait-prediction.ts 的预测结果。
 *
 * 用法：
 *   node scripts/collect_wait_snapshots.mjs            # 采集并写入
 *   node scripts/collect_wait_snapshots.mjs --dry-run  # 只打印，不写文件
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "wait-snapshots");
const QUEUE_TIMES_PARK_ID = 30; // Shanghai Disney Resort

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * 从 TypeScript 的映射表里抽出 Queue-Times ID → 内部 slug。
 * 直接解析源文件而不是引入构建步骤：这个脚本要能在 CI 里用裸 node 跑起来，
 * 而映射表必须与应用共用同一份，不能在这里复制一份出来慢慢腐烂。
 */
async function loadIdMap() {
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(path.join(ROOT, "src", "lib", "provider-ids.ts"), "utf-8")
  );
  const map = new Map();
  const re = /"([a-z0-9-]+)":\s*\{\s*themeparks:\s*(?:null|"[^"]+"),\s*queueTimes:\s*(\d+)/g;
  let m;
  while ((m = re.exec(src)) !== null) map.set(Number(m[2]), m[1]);
  if (!map.size) throw new Error("未能从 provider-ids.ts 解析出任何 Queue-Times ID 映射");
  return map;
}

async function main() {
  const idMap = await loadIdMap();

  const res = await fetch(`https://queue-times.com/parks/${QUEUE_TIMES_PARK_ID}/queue_times.json`);
  if (!res.ok) throw new Error(`Queue-Times 返回 ${res.status}`);
  const json = await res.json();

  const rides = [
    ...(json.lands ?? []).flatMap((l) => l.rides ?? []),
    ...(json.rides ?? []),
  ];

  const ts = new Date().toISOString();
  const rows = [];
  for (const ride of rides) {
    const rideId = idMap.get(Number(ride.id));
    if (!rideId) continue;
    rows.push({
      ts,
      rideId,
      // 未开放时记 null 而不是 0：0 会被当成"不用排队"拉低历史均值
      wait: ride.is_open === false ? null : (ride.wait_time ?? null),
    });
  }

  if (!rows.length) {
    console.error("没有采集到任何已映射的项目——映射表可能已漂移，请检查 provider-ids.ts");
    process.exit(1);
  }

  const openCount = rows.filter((r) => r.wait != null).length;
  console.log(`${ts} 采集到 ${rows.length} 个项目，其中 ${openCount} 个开放中`);

  if (DRY_RUN) {
    console.log(rows.slice(0, 5).map((r) => `  ${r.rideId}: ${r.wait ?? "未开放"}`).join("\n"));
    return;
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const shard = `${ts.slice(0, 7)}.jsonl`;
  appendFileSync(
    path.join(OUT_DIR, shard),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf-8"
  );
  console.log(`已追加到 data/wait-snapshots/${shard}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
