#!/usr/bin/env python3
"""
自建排队数据录制器（git-scraping 模式，多乐园）

乐园列表由 scripts/parks_config.json 驱动，每个乐园双源互备：
  1. themeparks.wiki  — 按 themeparks_wiki_entity
  2. queue-times.com  — 按 queue_times_park_id（要求产品内标注 "Powered by Queue-Times.com"）

输出：data/waittimes/{park_id}/YYYY-MM-DD.jsonl，每行一条快照记录（source + 时间戳 + 原始响应）。
由 .github/workflows/record-waittimes.yml 定时调用并 commit 回仓库，
积累的 JSONL 同时用作：
  - 历史排队预测的训练数据
  - RL 沙箱 record & replay 的回放缓存
  - 多乐园 = RL 的多环境泛化数据

用法：
  python scripts/record_waittimes.py            # 抓一次快照并写文件
  python scripts/record_waittimes.py --dry-run  # 只打印不写文件
"""

import argparse
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = Path(__file__).resolve().parent / "parks_config.json"
OUT_ROOT = ROOT / "data" / "waittimes"
RETRIES = 3
TIMEOUT_S = 20


def fetch(url: str) -> dict:
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "park-intel-recorder/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - 网络异常统一重试
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed after {RETRIES} retries: {url}: {last_err}")


def sources_for(park: dict) -> dict:
    return {
        "themeparks_wiki": f"https://api.themeparks.wiki/v1/entity/{park['themeparks_wiki_entity']}/live",
        "queue_times": f"https://queue-times.com/parks/{park['queue_times_park_id']}/queue_times.json",
    }


def record_park(park: dict, now: datetime) -> tuple[list, int]:
    records, failures = [], 0
    for source, url in sources_for(park).items():
        try:
            payload = fetch(url)
            records.append({"ts": now.isoformat(), "park": park["id"], "source": source, "ok": True, "data": payload})
            print(f"[ok] {park['id']}/{source}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            # 单源失败不阻塞另一源——双源互备的意义所在
            failures += 1
            records.append({"ts": now.isoformat(), "park": park["id"], "source": source, "ok": False, "error": str(e)})
            print(f"[fail] {park['id']}/{source}: {e}", file=sys.stderr)
    return records, failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    parks = [p for p in config["parks"] if p.get("enabled", True)]
    if not parks:
        print("no enabled parks in parks_config.json", file=sys.stderr)
        return 1

    now = datetime.now(timezone.utc)
    total_failures = 0
    total_sources = 0

    for park in parks:
        records, failures = record_park(park, now)
        total_failures += failures
        total_sources += len(records)

        if args.dry_run:
            print(json.dumps(records, ensure_ascii=False, indent=2)[:1500])
            continue

        out_dir = OUT_ROOT / park["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{now.date().isoformat()}.jsonl"
        with out_file.open("a", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"wrote {len(records)} records -> {out_file}", file=sys.stderr)

    # 全部源都挂才算失败
    return 1 if total_failures == total_sources else 0


if __name__ == "__main__":
    sys.exit(main())
