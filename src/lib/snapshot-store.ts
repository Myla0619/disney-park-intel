/**
 * 历史快照的读取
 *
 * 快照以按月分片的 JSONL 存放在 data/wait-snapshots/ 下，由 GitHub Actions 定时
 * 采集并提交（scripts/collect_wait_snapshots.mjs）。选 JSONL 而非数据库，是因为
 * 采集是纯追加、读取是全量扫描，且这样数据随仓库一起版本化，任何人 clone 下来
 * 就能复现预测结果，不需要额外的基础设施。
 *
 * 读取结果在进程内缓存：文件只在定时任务提交时变化，运行期是只读的。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { Snapshot } from "./wait-prediction";

const DATA_DIR = path.join(process.cwd(), "data", "wait-snapshots");
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { data: Snapshot[]; ts: number } | null = null;

/** 只读最近 monthsBack+1 个月的分片——更早的数据对 4 周窗口没有意义。 */
function shardNames(now: Date, monthsBack = 2): string[] {
  const names: string[] = [];
  for (let i = 0; i <= monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    names.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}.jsonl`);
  }
  return names;
}

export function loadSnapshots(now: Date = new Date()): Snapshot[] {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
  if (!existsSync(DATA_DIR)) return [];

  const available = new Set(readdirSync(DATA_DIR));
  const data: Snapshot[] = [];

  for (const name of shardNames(now)) {
    if (!available.has(name)) continue;
    const raw = readFileSync(path.join(DATA_DIR, name), "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        data.push(JSON.parse(line) as Snapshot);
      } catch {
        // 单行损坏（采集中断写了半行）不应让整个预测功能失效
      }
    }
  }

  cache = { data, ts: Date.now() };
  return data;
}

/** 仅供测试使用。 */
export function __clearSnapshotCache() {
  cache = null;
}
