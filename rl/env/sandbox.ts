/**
 * 沙箱：record & replay
 *
 * 优先读自建录制的数据 data/waittimes/{recorderParkId}/*.jsonl
 * （由 scripts/record_waittimes.py + GitHub Actions cron 持续积累），
 * 没有录制数据时回退到 rl/env/fixtures/waittimes.sample.jsonl（合成样例，仅用于跑通链路）。
 *
 * RL rollout 全部走沙箱：零 API 成本、可复现、不受 QPS 限制。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DATA_DIR = join(ROOT, "data", "waittimes");
const FIXTURE_FILE = join(HERE, "fixtures", "waittimes.sample.jsonl");

export type SnapshotRecord = {
  ts: string;
  park: string; // recorder park id，如 shanghai-disneyland
  source: "themeparks_wiki" | "queue_times";
  ok: boolean;
  data?: unknown;
  error?: string;
};

const cache = new Map<string, SnapshotRecord[]>();

function parseJsonl(path: string): SnapshotRecord[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SnapshotRecord);
}

// PARK_SANDBOX_FIXTURES_ONLY=1 忽略录制数据，只读合成夹具——
// 冒烟测试/CI 用，保证与真实 cron 积累的数据无关、可复现。
const FIXTURES_ONLY = process.env.PARK_SANDBOX_FIXTURES_ONLY === "1";

function loadRecords(recorderParkId: string): SnapshotRecord[] {
  const cached = cache.get(recorderParkId);
  if (cached) return cached;

  let records: SnapshotRecord[] = [];
  const parkDir = join(DATA_DIR, recorderParkId);
  if (!FIXTURES_ONLY && existsSync(parkDir)) {
    const files = readdirSync(parkDir).filter((f) => f.endsWith(".jsonl")).sort();
    for (const f of files) records.push(...parseJsonl(join(parkDir, f)));
  }
  if (records.length === 0 && existsSync(FIXTURE_FILE)) {
    records = parseJsonl(FIXTURE_FILE).filter((r) => r.park === recorderParkId);
  }
  cache.set(recorderParkId, records);
  return records;
}

/**
 * 取某源最新一条成功快照。
 * at（ISO 时间）用于回放历史时刻：取 <= at 的最近一条，让训练可以"指定当天拥挤度"。
 */
export function getSnapshot(
  recorderParkId: string,
  source: SnapshotRecord["source"],
  at?: string
): SnapshotRecord | null {
  const records = loadRecords(recorderParkId)
    .filter((r) => r.source === source && r.ok)
    .filter((r) => (at ? r.ts <= at : true));
  return records.length ? records[records.length - 1] : null;
}

export function sandboxAvailable(recorderParkId: string): boolean {
  return loadRecords(recorderParkId).some((r) => r.ok);
}
